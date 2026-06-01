package handlers

import (
	"errors"
	"strconv"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/ishansaini194/lms/api/internal/middleware"
	"github.com/ishansaini194/lms/api/internal/models"
	"gorm.io/gorm"
)

type NoticesHandler struct {
	DB *gorm.DB
}

func NewNoticesHandler(db *gorm.DB) *NoticesHandler {
	return &NoticesHandler{DB: db}
}

type CreateNoticeRequest struct {
	Title           string `json:"title"`
	Body            string `json:"body"`
	TargetAllSchool bool   `json:"target_all_school"`
	ClassYearIDs    []uint `json:"class_year_ids"`
}

type UpdateNoticeRequest struct {
	Title           *string `json:"title,omitempty"`
	Body            *string `json:"body,omitempty"`
	TargetAllSchool *bool   `json:"target_all_school,omitempty"`
	ClassYearIDs    *[]uint `json:"class_year_ids,omitempty"` // nil = leave targets unchanged
}

// noticeResponse bundles a notice with its target class_year IDs.
type noticeResponse struct {
	models.Notice
	ClassYearIDs []uint `json:"class_year_ids"`
}

// noticeListItem enriches a notice with the author's name and its target
// class_year IDs (so the edit modal can prefill without a second call).
type noticeListItem struct {
	models.Notice
	PostedByName string `json:"posted_by_name"`
	ClassYearIDs []uint `json:"class_year_ids"`
}

// enrichNotices attaches author name + target class_year IDs via two batched
// queries (no N+1). Order is preserved.
func (h *NoticesHandler) enrichNotices(schoolID uint, notices []models.Notice) []noticeListItem {
	items := make([]noticeListItem, len(notices))
	for i := range notices {
		items[i] = noticeListItem{Notice: notices[i], ClassYearIDs: []uint{}}
	}
	if len(notices) == 0 {
		return items
	}

	noticeIDs := make([]uint, len(notices))
	userIDSet := map[uint]bool{}
	userIDs := []uint{}
	for i, n := range notices {
		noticeIDs[i] = n.ID
		if !userIDSet[n.PostedByID] {
			userIDSet[n.PostedByID] = true
			userIDs = append(userIDs, n.PostedByID)
		}
	}

	// Author names: display_name, falling back to username.
	type uRow struct {
		ID          uint
		Username    string
		DisplayName *string
	}
	var uRows []uRow
	h.DB.Table("users").
		Select("id, username, display_name").
		Where("school_id = ? AND id IN ?", schoolID, userIDs).
		Scan(&uRows)
	nameByUser := map[uint]string{}
	for _, u := range uRows {
		if u.DisplayName != nil && *u.DisplayName != "" {
			nameByUser[u.ID] = *u.DisplayName
		} else {
			nameByUser[u.ID] = u.Username
		}
	}

	// Target class_year IDs grouped by notice.
	type tRow struct {
		NoticeID    uint
		ClassYearID uint
	}
	var tRows []tRow
	h.DB.Table("notice_targets").
		Select("notice_id, class_year_id").
		Where("notice_id IN ?", noticeIDs).
		Scan(&tRows)
	targetsByNotice := map[uint][]uint{}
	for _, t := range tRows {
		targetsByNotice[t.NoticeID] = append(targetsByNotice[t.NoticeID], t.ClassYearID)
	}

	for i := range items {
		items[i].PostedByName = nameByUser[items[i].PostedByID]
		if ids, ok := targetsByNotice[items[i].ID]; ok {
			items[i].ClassYearIDs = ids
		}
	}
	return items
}

// GET /api/notices?include_inactive=&class_year_id=
func (h *NoticesHandler) List(c *fiber.Ctx) error {
	schoolID := middleware.GetSchoolID(c)
	includeInactive, _ := strconv.ParseBool(c.Query("include_inactive"))
	classYearID := c.QueryInt("class_year_id", 0)

	query := h.DB.Model(&models.Notice{}).Where("notices.school_id = ?", schoolID)
	if !includeInactive {
		query = query.Where("notices.is_active = ?", true)
	}
	if isTeacher(c) {
		query = query.Where("notices.posted_by_id = ?", middleware.GetUserID(c))
	}

	// Filter to notices visible to a class_year: either school-wide, or targeted at it.
	if classYearID > 0 {
		query = query.
			Joins("LEFT JOIN notice_targets ON notice_targets.notice_id = notices.id").
			Where("notices.target_all_school = ? OR notice_targets.class_year_id = ?", true, classYearID).
			Group("notices.id")
	}

	var notices []models.Notice
	if err := query.Order("notices.created_at DESC").Find(&notices).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to fetch notices"})
	}

	return c.JSON(h.enrichNotices(schoolID, notices))
}

// GET /api/notices/:id  (includes target class_year IDs)
func (h *NoticesHandler) GetOne(c *fiber.Ctx) error {
	schoolID := middleware.GetSchoolID(c)

	id, err := strconv.Atoi(c.Params("id"))
	if err != nil || id <= 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid notice id"})
	}

	var notice models.Notice
	if err := h.DB.Where("id = ? AND school_id = ?", id, schoolID).First(&notice).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "notice not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "database error"})
	}
	if isTeacher(c) {
		if notice.PostedByID != middleware.GetUserID(c) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "notice not found"})
		}
	}

	var ids []uint
	if err := h.DB.Model(&models.NoticeTarget{}).
		Where("notice_id = ?", notice.ID).
		Pluck("class_year_id", &ids).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to fetch targets"})
	}

	return c.JSON(noticeResponse{Notice: notice, ClassYearIDs: ids})
}

// POST /api/notices
func (h *NoticesHandler) Create(c *fiber.Ctx) error {
	schoolID := middleware.GetSchoolID(c)
	userID := middleware.GetUserID(c)

	var body CreateNoticeRequest
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request"})
	}

	body.Title = strings.TrimSpace(body.Title)
	body.Body = strings.TrimSpace(body.Body)
	if body.Title == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "title is required"})
	}
	if body.Body == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "body is required"})
	}

	// If not school-wide, must target at least one class_year
	if !body.TargetAllSchool && len(body.ClassYearIDs) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "specify class_year_ids or set target_all_school=true",
		})
	}

	notice := models.Notice{
		SchoolID:        schoolID,
		PostedByID:      userID,
		Title:           body.Title,
		Body:            body.Body,
		TargetAllSchool: body.TargetAllSchool,
		IsActive:        true,
	}

	err := h.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&notice).Error; err != nil {
			return err
		}

		// Only create targets if not school-wide
		if !body.TargetAllSchool {
			if err := h.validateAndInsertTargets(tx, schoolID, notice.ID, body.ClassYearIDs); err != nil {
				return err
			}
		}
		return nil
	})

	if err != nil {
		var he *httpError
		if errors.As(err, &he) {
			return c.Status(he.status).JSON(fiber.Map{"error": he.msg})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to create notice"})
	}

	return c.Status(fiber.StatusCreated).JSON(noticeResponse{Notice: notice, ClassYearIDs: body.ClassYearIDs})
}

// PUT /api/notices/:id
func (h *NoticesHandler) Update(c *fiber.Ctx) error {
	schoolID := middleware.GetSchoolID(c)

	id, err := strconv.Atoi(c.Params("id"))
	if err != nil || id <= 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid notice id"})
	}

	var body UpdateNoticeRequest
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request"})
	}

	err = h.DB.Transaction(func(tx *gorm.DB) error {
		var notice models.Notice
		if err := tx.Where("id = ? AND school_id = ?", id, schoolID).First(&notice).Error; err != nil {
			return err
		}
		if isTeacher(c) {
			if notice.PostedByID != middleware.GetUserID(c) {
				return &httpError{fiber.StatusNotFound, "notice not found"}
			}
		}

		updates := map[string]interface{}{}
		if body.Title != nil {
			t := strings.TrimSpace(*body.Title)
			if t == "" {
				return &httpError{fiber.StatusBadRequest, "title cannot be empty"}
			}
			updates["title"] = t
		}
		if body.Body != nil {
			b := strings.TrimSpace(*body.Body)
			if b == "" {
				return &httpError{fiber.StatusBadRequest, "body cannot be empty"}
			}
			updates["body"] = b
		}

		// Determine the resulting target_all_school value
		targetAll := notice.TargetAllSchool
		if body.TargetAllSchool != nil {
			targetAll = *body.TargetAllSchool
			updates["target_all_school"] = targetAll
		}

		if len(updates) > 0 {
			if err := tx.Model(&notice).Updates(updates).Error; err != nil {
				return err
			}
		}

		// Targets: only touch if class_year_ids provided OR target_all_school flipped
		if body.ClassYearIDs != nil || body.TargetAllSchool != nil {
			// Wipe existing targets
			if err := tx.Where("notice_id = ?", notice.ID).Delete(&models.NoticeTarget{}).Error; err != nil {
				return err
			}
			// Re-insert only if not school-wide
			if !targetAll {
				ids := []uint{}
				if body.ClassYearIDs != nil {
					ids = *body.ClassYearIDs
				}
				if len(ids) == 0 {
					return &httpError{fiber.StatusBadRequest, "specify class_year_ids or set target_all_school=true"}
				}
				if err := h.validateAndInsertTargets(tx, schoolID, notice.ID, ids); err != nil {
					return err
				}
			}
		}
		return nil
	})

	if err != nil {
		var he *httpError
		if errors.As(err, &he) {
			return c.Status(he.status).JSON(fiber.Map{"error": he.msg})
		}
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "notice not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "update failed"})
	}

	return h.GetOne(c)
}

// DELETE /api/notices/:id  (soft delete via is_active=false)
func (h *NoticesHandler) Delete(c *fiber.Ctx) error {
	schoolID := middleware.GetSchoolID(c)

	id, err := strconv.Atoi(c.Params("id"))
	if err != nil || id <= 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid notice id"})
	}

	var notice models.Notice
	if err := h.DB.Where("id = ? AND school_id = ?", id, schoolID).First(&notice).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "notice not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "database error"})
	}
	if isTeacher(c) {
		if notice.PostedByID != middleware.GetUserID(c) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "notice not found"})
		}
	}

	if err := h.DB.Model(&notice).Update("is_active", false).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to delete notice"})
	}

	return c.JSON(fiber.Map{"message": "notice deleted"})
}

// validateAndInsertTargets verifies each class_year belongs to the school, then bulk-inserts targets.
func (h *NoticesHandler) validateAndInsertTargets(tx *gorm.DB, schoolID, noticeID uint, classYearIDs []uint) error {
	// Dedupe
	seen := map[uint]bool{}
	unique := make([]uint, 0, len(classYearIDs))
	for _, id := range classYearIDs {
		if id == 0 {
			return &httpError{fiber.StatusBadRequest, "invalid class_year_id"}
		}
		if !seen[id] {
			seen[id] = true
			unique = append(unique, id)
		}
	}

	// Verify all belong to this school
	var count int64
	if err := tx.Model(&models.ClassYear{}).
		Where("school_id = ? AND id IN ?", schoolID, unique).
		Count(&count).Error; err != nil {
		return err
	}
	if int(count) != len(unique) {
		return &httpError{fiber.StatusBadRequest, "one or more class_year_ids not found in this school"}
	}

	targets := make([]models.NoticeTarget, 0, len(unique))
	for _, id := range unique {
		targets = append(targets, models.NoticeTarget{NoticeID: noticeID, ClassYearID: id})
	}
	return tx.Create(&targets).Error
}
