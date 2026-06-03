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

type ExamTermsHandler struct {
	DB *gorm.DB
}

func NewExamTermsHandler(db *gorm.DB) *ExamTermsHandler {
	return &ExamTermsHandler{DB: db}
}

type createExamTermRequest struct {
	AcademicYearID uint   `json:"academic_year_id"`
	Name           string `json:"name"`
	SortOrder      *int   `json:"sort_order,omitempty"`
}

type updateExamTermRequest struct {
	Name      *string `json:"name,omitempty"`
	SortOrder *int    `json:"sort_order,omitempty"`
}

// GET /api/exam-terms?academic_year_id=<id>
// Lists active terms for the school, ordered by sort_order then name.
// academic_year_id is optional — omitted returns terms across all years.
func (h *ExamTermsHandler) List(c *fiber.Ctx) error {
	schoolID := middleware.GetSchoolID(c)

	query := h.DB.Model(&models.ExamTerm{}).Where("school_id = ? AND is_active = ?", schoolID, true)
	if yearID := c.QueryInt("academic_year_id", 0); yearID > 0 {
		query = query.Where("academic_year_id = ?", yearID)
	}

	var terms []models.ExamTerm
	if err := query.Order("sort_order ASC, name ASC").Find(&terms).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to fetch exam terms"})
	}
	return c.JSON(terms)
}

// POST /api/exam-terms
func (h *ExamTermsHandler) Create(c *fiber.Ctx) error {
	schoolID := middleware.GetSchoolID(c)

	var body createExamTermRequest
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request"})
	}
	body.Name = strings.TrimSpace(body.Name)
	if body.AcademicYearID == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "academic_year_id is required"})
	}
	if body.Name == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "name is required"})
	}

	// academic_year belongs to this school
	if err := h.validateAcademicYear(body.AcademicYearID, schoolID); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "academic_year not found in this school"})
	}

	term := models.ExamTerm{
		SchoolID:       schoolID,
		AcademicYearID: body.AcademicYearID,
		Name:           body.Name,
		IsActive:       true,
	}
	if body.SortOrder != nil {
		term.SortOrder = *body.SortOrder
	}

	if err := h.DB.Create(&term).Error; err != nil {
		if isUniqueViolation(err) {
			return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "an exam term with that name already exists for this academic year"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to create exam term"})
	}
	return c.Status(fiber.StatusCreated).JSON(term)
}

// PUT /api/exam-terms/:id  — update name and/or sort_order
func (h *ExamTermsHandler) Update(c *fiber.Ctx) error {
	schoolID := middleware.GetSchoolID(c)
	id, err := strconv.Atoi(c.Params("id"))
	if err != nil || id <= 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid exam term id"})
	}

	var body updateExamTermRequest
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request"})
	}

	var term models.ExamTerm
	if err := h.DB.Where("id = ? AND school_id = ?", id, schoolID).First(&term).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "exam term not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "database error"})
	}

	updates := map[string]interface{}{}
	if body.Name != nil {
		n := strings.TrimSpace(*body.Name)
		if n == "" {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "name cannot be empty"})
		}
		updates["name"] = n
	}
	if body.SortOrder != nil {
		updates["sort_order"] = *body.SortOrder
	}

	if len(updates) > 0 {
		if err := h.DB.Model(&term).Updates(updates).Error; err != nil {
			if isUniqueViolation(err) {
				return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "an exam term with that name already exists for this academic year"})
			}
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "update failed"})
		}
	}

	// reload
	if err := h.DB.Where("id = ? AND school_id = ?", id, schoolID).First(&term).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "update succeeded but reload failed"})
	}
	return c.JSON(term)
}

// DELETE /api/exam-terms/:id  (soft delete: is_active=false)
// Refuses if any active exam still references the term, rather than orphaning it.
func (h *ExamTermsHandler) Delete(c *fiber.Ctx) error {
	schoolID := middleware.GetSchoolID(c)
	id, err := strconv.Atoi(c.Params("id"))
	if err != nil || id <= 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid exam term id"})
	}

	var term models.ExamTerm
	if err := h.DB.Where("id = ? AND school_id = ?", id, schoolID).First(&term).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "exam term not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "database error"})
	}

	// Refuse if active exams still reference this term — don't orphan them.
	var examCount int64
	if err := h.DB.Model(&models.Exam{}).
		Where("school_id = ? AND exam_term_id = ? AND is_active = ?", schoolID, term.ID, true).
		Count(&examCount).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "database error"})
	}
	if examCount > 0 {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "term has exams; remove or reassign them first"})
	}

	if err := h.DB.Model(&term).Update("is_active", false).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to delete exam term"})
	}
	return c.JSON(fiber.Map{"message": "exam term removed"})
}

// --- helpers ---

func (h *ExamTermsHandler) validateAcademicYear(yearID, schoolID uint) error {
	var count int64
	if err := h.DB.Model(&models.AcademicYear{}).
		Where("id = ? AND school_id = ?", yearID, schoolID).
		Count(&count).Error; err != nil {
		return err
	}
	if count == 0 {
		return errors.New("academic_year not found")
	}
	return nil
}
