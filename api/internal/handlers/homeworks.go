package handlers

import (
	"errors"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/ishansaini194/lms/api/internal/middleware"
	"github.com/ishansaini194/lms/api/internal/models"
	"gorm.io/gorm"
)

type HomeworksHandler struct {
	DB *gorm.DB
}

func NewHomeworksHandler(db *gorm.DB) *HomeworksHandler {
	return &HomeworksHandler{DB: db}
}

type CreateHomeworkRequest struct {
	TeacherID    uint       `json:"teacher_id"`
	SubjectID    *uint      `json:"subject_id,omitempty"` // optional
	Content      string     `json:"content"`
	DueDate      *time.Time `json:"due_date,omitempty"`
	ClassYearIDs []uint     `json:"class_year_ids"`
}

type UpdateHomeworkRequest struct {
	SubjectID    *uint      `json:"subject_id,omitempty"` // always applied on edit (nil clears)
	Content      *string    `json:"content,omitempty"`
	DueDate      *time.Time `json:"due_date,omitempty"`
	ClassYearIDs *[]uint    `json:"class_year_ids,omitempty"` // nil = leave targets unchanged
}

type homeworkResponse struct {
	models.Homework
	ClassYearIDs []uint `json:"class_year_ids"`
}

// homeworkListItem enriches a Homework with its target class_year IDs and labels
// for the list view chips. Mirrors examListItem/noticeListItem.
type homeworkListItem struct {
	models.Homework
	ClassYearIDs []uint   `json:"class_year_ids"`
	ClassLabels  []string `json:"class_labels"` // ["2-A", "3-A"]
}

// GET /api/homeworks?include_inactive=&class_year_id=&teacher_id=
func (h *HomeworksHandler) List(c *fiber.Ctx) error {
	schoolID := middleware.GetSchoolID(c)
	includeInactive, _ := strconv.ParseBool(c.Query("include_inactive"))
	classYearID := c.QueryInt("class_year_id", 0)
	teacherID := c.QueryInt("teacher_id", 0)

	query := h.DB.Model(&models.Homework{}).Where("homeworks.school_id = ?", schoolID)
	if !includeInactive {
		query = query.Where("homeworks.is_active = ?", true)
	}
	if teacherID > 0 {
		query = query.Where("homeworks.teacher_id = ?", teacherID)
	}
	if isTeacher(c) {
		query = query.Where("homeworks.teacher_id = ?", middleware.GetTeacherID(c))
	}
	if classYearID > 0 {
		query = query.
			Joins("JOIN homework_targets ON homework_targets.homework_id = homeworks.id").
			Where("homework_targets.class_year_id = ?", classYearID).
			Group("homeworks.id")
	}

	var homeworks []models.Homework
	if err := query.Order("homeworks.due_date DESC NULLS LAST, homeworks.id DESC").Find(&homeworks).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to fetch homeworks"})
	}

	return c.JSON(h.enrichHomeworks(schoolID, homeworks))
}

// enrichHomeworks attaches target class_year IDs + labels via two batched queries
// (no N+1). Order preserved. Both slices are non-nil so JSON is [] not null.
func (h *HomeworksHandler) enrichHomeworks(schoolID uint, homeworks []models.Homework) []homeworkListItem {
	items := make([]homeworkListItem, len(homeworks))
	idxByHW := make(map[uint]int, len(homeworks))
	for i := range homeworks {
		items[i] = homeworkListItem{Homework: homeworks[i], ClassYearIDs: []uint{}, ClassLabels: []string{}}
		idxByHW[homeworks[i].ID] = i
	}
	if len(homeworks) == 0 {
		return items
	}

	hwIDs := make([]uint, len(homeworks))
	for i, hw := range homeworks {
		hwIDs[i] = hw.ID
	}

	// All (homework_id, class_year_id) target pairs, ordered for stable chips.
	type targetRow struct {
		HomeworkID  uint
		ClassYearID uint
	}
	var targets []targetRow
	h.DB.Table("homework_targets").
		Select("homework_id, class_year_id").
		Where("homework_id IN ?", hwIDs).
		Order("class_year_id ASC").
		Scan(&targets)

	// class_year → label for the distinct target set.
	cySet := map[uint]bool{}
	for _, t := range targets {
		cySet[t.ClassYearID] = true
	}
	labelByCY := map[uint]string{}
	if len(cySet) > 0 {
		cyIDs := make([]uint, 0, len(cySet))
		for id := range cySet {
			cyIDs = append(cyIDs, id)
		}
		type clRow struct {
			ID      uint
			Name    string
			Section string
		}
		var rows []clRow
		h.DB.Table("class_years").
			Select("class_years.id, classes.name, classes.section").
			Joins("JOIN classes ON classes.id = class_years.class_id").
			Where("class_years.school_id = ? AND class_years.id IN ?", schoolID, cyIDs).
			Scan(&rows)
		for _, r := range rows {
			label := r.Name
			if r.Section != "" {
				label += "-" + r.Section
			}
			labelByCY[r.ID] = label
		}
	}

	for _, t := range targets {
		i := idxByHW[t.HomeworkID]
		items[i].ClassYearIDs = append(items[i].ClassYearIDs, t.ClassYearID)
		if label, ok := labelByCY[t.ClassYearID]; ok {
			items[i].ClassLabels = append(items[i].ClassLabels, label)
		}
	}

	stampHomeworkSubjects(h.DB, schoolID, items)
	return items
}

// stampHomeworkSubjects fills SubjectName on each item from its SubjectID via
// one batched lookup. Works for homeworkListItem (embeds Homework).
func stampHomeworkSubjects(db *gorm.DB, schoolID uint, items []homeworkListItem) {
	ids := []uint{}
	seen := map[uint]bool{}
	for i := range items {
		if items[i].SubjectID != nil && !seen[*items[i].SubjectID] {
			seen[*items[i].SubjectID] = true
			ids = append(ids, *items[i].SubjectID)
		}
	}
	names := subjectNamesByID(db, schoolID, ids)
	for i := range items {
		if items[i].SubjectID != nil {
			if name, ok := names[*items[i].SubjectID]; ok {
				n := name
				items[i].SubjectName = &n
			}
		}
	}
}

// GET /api/homeworks/:id  (includes target class_year IDs)
func (h *HomeworksHandler) GetOne(c *fiber.Ctx) error {
	schoolID := middleware.GetSchoolID(c)

	id, err := strconv.Atoi(c.Params("id"))
	if err != nil || id <= 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid homework id"})
	}

	var homework models.Homework
	if err := h.DB.Where("id = ? AND school_id = ?", id, schoolID).First(&homework).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "homework not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "database error"})
	}
	if isTeacher(c) {
		if homework.TeacherID != middleware.GetTeacherID(c) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "homework not found"})
		}
	}

	var ids []uint
	if err := h.DB.Model(&models.HomeworkTarget{}).
		Where("homework_id = ?", homework.ID).
		Pluck("class_year_id", &ids).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to fetch targets"})
	}

	return c.JSON(homeworkResponse{Homework: homework, ClassYearIDs: ids})
}

// POST /api/homeworks
func (h *HomeworksHandler) Create(c *fiber.Ctx) error {
	schoolID := middleware.GetSchoolID(c)

	var body CreateHomeworkRequest
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request"})
	}

	if isTeacher(c) {
		body.TeacherID = middleware.GetTeacherID(c)
	} else {
		if body.TeacherID == 0 {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "teacher_id is required"})
		}
		// Verify teacher belongs to this school
		var teacherCount int64
		if err := h.DB.Model(&models.Teacher{}).
			Where("id = ? AND school_id = ?", body.TeacherID, schoolID).
			Count(&teacherCount).Error; err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "database error"})
		}
		if teacherCount == 0 {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "teacher not found in this school"})
		}
	}
	body.Content = strings.TrimSpace(body.Content)
	if body.Content == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "content is required"})
	}
	if len(body.ClassYearIDs) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "at least one class_year_id is required"})
	}
	// Subject is optional; when given it must belong to this school.
	if body.SubjectID != nil && !subjectExistsInSchool(h.DB, *body.SubjectID, schoolID) {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "subject not found in this school"})
	}

	homework := models.Homework{
		SchoolID:  schoolID,
		TeacherID: body.TeacherID,
		SubjectID: body.SubjectID,
		Content:   body.Content,
		DueDate:   body.DueDate,
		IsActive:  true,
	}

	err := h.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&homework).Error; err != nil {
			return err
		}
		return h.validateAndInsertTargets(tx, schoolID, homework.ID, body.ClassYearIDs)
	})

	if err != nil {
		var he *httpError
		if errors.As(err, &he) {
			return c.Status(he.status).JSON(fiber.Map{"error": he.msg})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to create homework"})
	}

	return c.Status(fiber.StatusCreated).JSON(homeworkResponse{Homework: homework, ClassYearIDs: body.ClassYearIDs})
}

// PUT /api/homeworks/:id
func (h *HomeworksHandler) Update(c *fiber.Ctx) error {
	schoolID := middleware.GetSchoolID(c)

	id, err := strconv.Atoi(c.Params("id"))
	if err != nil || id <= 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid homework id"})
	}

	var body UpdateHomeworkRequest
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request"})
	}

	err = h.DB.Transaction(func(tx *gorm.DB) error {
		var homework models.Homework
		if err := tx.Where("id = ? AND school_id = ?", id, schoolID).First(&homework).Error; err != nil {
			return err
		}
		if isTeacher(c) {
			if homework.TeacherID != middleware.GetTeacherID(c) {
				return &httpError{fiber.StatusNotFound, "homework not found"}
			}
		}

		updates := map[string]interface{}{}
		// Subject is always applied on edit — the modal sends the current value
		// (or null to clear). Validate when set.
		if body.SubjectID != nil && !subjectExistsInSchool(tx, *body.SubjectID, schoolID) {
			return &httpError{fiber.StatusBadRequest, "subject not found in this school"}
		}
		updates["subject_id"] = body.SubjectID
		if body.Content != nil {
			ct := strings.TrimSpace(*body.Content)
			if ct == "" {
				return &httpError{fiber.StatusBadRequest, "content cannot be empty"}
			}
			updates["content"] = ct
		}
		if body.DueDate != nil {
			updates["due_date"] = *body.DueDate
		}

		if len(updates) > 0 {
			if err := tx.Model(&homework).Updates(updates).Error; err != nil {
				return err
			}
		}

		// Targets: only replace if class_year_ids provided
		if body.ClassYearIDs != nil {
			ids := *body.ClassYearIDs
			if len(ids) == 0 {
				return &httpError{fiber.StatusBadRequest, "at least one class_year_id is required"}
			}
			if err := tx.Where("homework_id = ?", homework.ID).Delete(&models.HomeworkTarget{}).Error; err != nil {
				return err
			}
			if err := h.validateAndInsertTargets(tx, schoolID, homework.ID, ids); err != nil {
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
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "homework not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "update failed"})
	}

	return h.GetOne(c)
}

// DELETE /api/homeworks/:id  (soft delete via is_active=false)
func (h *HomeworksHandler) Delete(c *fiber.Ctx) error {
	schoolID := middleware.GetSchoolID(c)

	id, err := strconv.Atoi(c.Params("id"))
	if err != nil || id <= 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid homework id"})
	}

	var homework models.Homework
	if err := h.DB.Where("id = ? AND school_id = ?", id, schoolID).First(&homework).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "homework not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "database error"})
	}
	if isTeacher(c) {
		if homework.TeacherID != middleware.GetTeacherID(c) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "homework not found"})
		}
	}

	if err := h.DB.Model(&homework).Update("is_active", false).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to delete homework"})
	}

	return c.JSON(fiber.Map{"message": "homework deleted"})
}

// validateAndInsertTargets verifies each class_year belongs to the school, then bulk-inserts.
//
// TODO(authz): for teachers this only checks the class_year is in their school,
// not that they actually teach/own it — a teacher could POST homework targeting
// any class in the school. The UI picker prevents this in normal use. To harden:
// when isTeacher, reject any class_year_id not in teacherClassYearIDs(...) (the
// helper already exists from the enrollments scope work) and return 400.
func (h *HomeworksHandler) validateAndInsertTargets(tx *gorm.DB, schoolID, homeworkID uint, classYearIDs []uint) error {
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

	var count int64
	if err := tx.Model(&models.ClassYear{}).
		Where("school_id = ? AND id IN ?", schoolID, unique).
		Count(&count).Error; err != nil {
		return err
	}
	if int(count) != len(unique) {
		return &httpError{fiber.StatusBadRequest, "one or more class_year_ids not found in this school"}
	}

	targets := make([]models.HomeworkTarget, 0, len(unique))
	for _, id := range unique {
		targets = append(targets, models.HomeworkTarget{HomeworkID: homeworkID, ClassYearID: id})
	}
	return tx.Create(&targets).Error
}
