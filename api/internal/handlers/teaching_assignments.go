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

type TeachingAssignmentsHandler struct {
	DB *gorm.DB
}

func NewTeachingAssignmentsHandler(db *gorm.DB) *TeachingAssignmentsHandler {
	return &TeachingAssignmentsHandler{DB: db}
}

// Enriched row: the assignment + a human class label for display.
type taListItem struct {
	ID          uint   `json:"id"`
	TeacherID   uint   `json:"teacher_id"`
	ClassYearID uint   `json:"class_year_id"`
	Subject     string `json:"subject"`
	ClassLabel  string `json:"class_label"` // "2-A"
	IsActive    bool   `json:"is_active"`
}

type createTARequest struct {
	TeacherID   uint   `json:"teacher_id"`
	ClassYearID uint   `json:"class_year_id"`
	Subject     string `json:"subject"`
}

// classLabelsFor resolves class_year_id → "name-section" for a set of ids
// (batched join, no N+1). Same label logic as enrichExams.
func (h *TeachingAssignmentsHandler) classLabelsFor(schoolID uint, cyIDs []uint) map[uint]string {
	out := map[uint]string{}
	if len(cyIDs) == 0 {
		return out
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
		out[r.ID] = label
	}
	return out
}

// GET /api/teaching-assignments?teacher_id=  (teacher_id required)
func (h *TeachingAssignmentsHandler) List(c *fiber.Ctx) error {
	schoolID := middleware.GetSchoolID(c)
	teacherID := c.QueryInt("teacher_id", 0)
	if teacherID <= 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "teacher_id is required"})
	}

	var rows []models.TeachingAssignment
	if err := h.DB.
		Where("school_id = ? AND teacher_id = ? AND is_active = ?", schoolID, teacherID, true).
		Order("id ASC").
		Find(&rows).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to fetch assignments"})
	}

	cyIDs := make([]uint, 0, len(rows))
	for _, r := range rows {
		cyIDs = append(cyIDs, r.ClassYearID)
	}
	labels := h.classLabelsFor(schoolID, cyIDs)

	items := make([]taListItem, 0, len(rows))
	for _, r := range rows {
		items = append(items, taListItem{
			ID:          r.ID,
			TeacherID:   r.TeacherID,
			ClassYearID: r.ClassYearID,
			Subject:     r.Subject,
			ClassLabel:  labels[r.ClassYearID],
			IsActive:    r.IsActive,
		})
	}
	return c.JSON(items)
}

// POST /api/teaching-assignments
func (h *TeachingAssignmentsHandler) Create(c *fiber.Ctx) error {
	schoolID := middleware.GetSchoolID(c)

	var body createTARequest
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request"})
	}
	body.Subject = strings.TrimSpace(body.Subject)
	if body.TeacherID == 0 || body.ClassYearID == 0 || body.Subject == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "teacher_id, class_year_id and subject are required"})
	}

	// teacher belongs to this school (and is active)
	var tCnt int64
	if err := h.DB.Model(&models.Teacher{}).
		Where("id = ? AND school_id = ? AND is_active = ?", body.TeacherID, schoolID, true).
		Count(&tCnt).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "database error"})
	}
	if tCnt == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "teacher not found in this school"})
	}

	// class_year belongs to this school (and is active). Current-AY scoping is
	// enforced by the picker, not here — same as homework/notice target checks.
	var cyCnt int64
	if err := h.DB.Model(&models.ClassYear{}).
		Where("id = ? AND school_id = ? AND is_active = ?", body.ClassYearID, schoolID, true).
		Count(&cyCnt).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "database error"})
	}
	if cyCnt == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "class_year not found in this school"})
	}

	ta := models.TeachingAssignment{
		SchoolID:    schoolID,
		TeacherID:   body.TeacherID,
		ClassYearID: body.ClassYearID,
		Subject:     body.Subject,
		IsActive:    true,
	}
	if err := h.DB.Create(&ta).Error; err != nil {
		if isUniqueViolation(err) {
			// A row for this triplet already exists. The unique index ignores
			// is_active, so it may be a soft-deleted (dormant) row — look it up:
			// reactivate if dormant, else it's a real active duplicate → 409.
			var existing models.TeachingAssignment
			if e := h.DB.Where("school_id = ? AND teacher_id = ? AND class_year_id = ? AND subject = ?",
				schoolID, body.TeacherID, body.ClassYearID, body.Subject).
				First(&existing).Error; e != nil {
				return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "database error"})
			}
			if existing.IsActive {
				return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "this teacher is already assigned that subject for this class"})
			}
			if e := h.DB.Model(&existing).Update("is_active", true).Error; e != nil {
				return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to create assignment"})
			}
			ta = existing
			ta.IsActive = true
		} else {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to create assignment"})
		}
	}

	labels := h.classLabelsFor(schoolID, []uint{ta.ClassYearID})
	return c.Status(fiber.StatusCreated).JSON(taListItem{
		ID:          ta.ID,
		TeacherID:   ta.TeacherID,
		ClassYearID: ta.ClassYearID,
		Subject:     ta.Subject,
		ClassLabel:  labels[ta.ClassYearID],
		IsActive:    ta.IsActive,
	})
}

// DELETE /api/teaching-assignments/:id
// Soft delete (is_active=false) — matches the project's dominant convention and
// keeps "previously taught" history. All read paths (List, teacher dashboard,
// enrollment scope) filter is_active=true, so it disappears. Re-adding the same
// triplet reactivates the dormant row in Create, since the unique index
// (teacher_id, class_year_id, subject) ignores is_active.
func (h *TeachingAssignmentsHandler) Delete(c *fiber.Ctx) error {
	schoolID := middleware.GetSchoolID(c)
	id, err := strconv.Atoi(c.Params("id"))
	if err != nil || id <= 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid assignment id"})
	}

	var ta models.TeachingAssignment
	if err := h.DB.Where("id = ? AND school_id = ?", id, schoolID).First(&ta).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "assignment not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "database error"})
	}

	if err := h.DB.Model(&ta).Update("is_active", false).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to delete assignment"})
	}
	return c.JSON(fiber.Map{"message": "assignment removed"})
}
