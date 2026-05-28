package handlers

import (
	"errors"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/ishansaini194/lms/api/internal/middleware"
	"github.com/ishansaini194/lms/api/internal/models"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type ExamsHandler struct {
	DB *gorm.DB
}

func NewExamsHandler(db *gorm.DB) *ExamsHandler {
	return &ExamsHandler{DB: db}
}

type CreateExamRequest struct {
	ClassYearID uint       `json:"class_year_id"`
	TeacherID   *uint      `json:"teacher_id,omitempty"`
	Name        string     `json:"name"`
	Subject     string     `json:"subject"`
	MaxMarks    int        `json:"max_marks"`
	ExamDate    *time.Time `json:"exam_date,omitempty"`
}

type UpdateExamRequest struct {
	TeacherID *uint      `json:"teacher_id,omitempty"` // 0 clears, value sets, omit leaves
	Name      *string    `json:"name,omitempty"`
	Subject   *string    `json:"subject,omitempty"`
	MaxMarks  *int       `json:"max_marks,omitempty"`
	ExamDate  *time.Time `json:"exam_date,omitempty"`
}

type ResultItem struct {
	EnrollmentID uint   `json:"enrollment_id"`
	Marks        string `json:"marks"` // decimal as string
}

type EnterResultsRequest struct {
	Results []ResultItem `json:"results"`
}

// GET /api/exams?include_inactive=&class_year_id=&teacher_id=
func (h *ExamsHandler) List(c *fiber.Ctx) error {
	schoolID := middleware.GetSchoolID(c)
	includeInactive, _ := strconv.ParseBool(c.Query("include_inactive"))
	classYearID := c.QueryInt("class_year_id", 0)
	teacherID := c.QueryInt("teacher_id", 0)

	query := h.DB.Model(&models.Exam{}).Where("school_id = ?", schoolID)
	if !includeInactive {
		query = query.Where("is_active = ?", true)
	}
	if classYearID > 0 {
		query = query.Where("class_year_id = ?", classYearID)
	}
	if teacherID > 0 {
		query = query.Where("teacher_id = ?", teacherID)
	}

	var exams []models.Exam
	if err := query.Order("exam_date DESC NULLS LAST, id DESC").Find(&exams).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to fetch exams"})
	}
	return c.JSON(exams)
}

// GET /api/exams/:id
func (h *ExamsHandler) GetOne(c *fiber.Ctx) error {
	schoolID := middleware.GetSchoolID(c)
	id, err := strconv.Atoi(c.Params("id"))
	if err != nil || id <= 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid exam id"})
	}

	var exam models.Exam
	if err := h.DB.Where("id = ? AND school_id = ?", id, schoolID).First(&exam).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "exam not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "database error"})
	}
	return c.JSON(exam)
}

// POST /api/exams
func (h *ExamsHandler) Create(c *fiber.Ctx) error {
	schoolID := middleware.GetSchoolID(c)

	var body CreateExamRequest
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request"})
	}

	if body.ClassYearID == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "class_year_id is required"})
	}
	body.Name = strings.TrimSpace(body.Name)
	body.Subject = strings.TrimSpace(body.Subject)
	if body.Name == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "name is required"})
	}
	if body.Subject == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "subject is required"})
	}
	if body.MaxMarks <= 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "max_marks must be greater than zero"})
	}

	// class_year belongs to school
	if err := h.validateClassYear(body.ClassYearID, schoolID); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "class_year not found in this school"})
	}
	// teacher (optional) belongs to school
	if body.TeacherID != nil {
		if err := h.validateTeacher(*body.TeacherID, schoolID); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "teacher not found in this school"})
		}
	}

	exam := models.Exam{
		SchoolID:    schoolID,
		ClassYearID: body.ClassYearID,
		TeacherID:   body.TeacherID,
		Name:        body.Name,
		Subject:     body.Subject,
		MaxMarks:    body.MaxMarks,
		ExamDate:    body.ExamDate,
		IsActive:    true,
	}
	if err := h.DB.Create(&exam).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to create exam"})
	}
	return c.Status(fiber.StatusCreated).JSON(exam)
}

// PUT /api/exams/:id
func (h *ExamsHandler) Update(c *fiber.Ctx) error {
	schoolID := middleware.GetSchoolID(c)
	id, err := strconv.Atoi(c.Params("id"))
	if err != nil || id <= 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid exam id"})
	}

	var body UpdateExamRequest
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request"})
	}

	var exam models.Exam
	if err := h.DB.Where("id = ? AND school_id = ?", id, schoolID).First(&exam).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "exam not found"})
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
	if body.Subject != nil {
		s := strings.TrimSpace(*body.Subject)
		if s == "" {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "subject cannot be empty"})
		}
		updates["subject"] = s
	}
	if body.ExamDate != nil {
		updates["exam_date"] = *body.ExamDate
	}
	if body.TeacherID != nil {
		if *body.TeacherID == 0 {
			updates["teacher_id"] = nil
		} else {
			if err := h.validateTeacher(*body.TeacherID, schoolID); err != nil {
				return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "teacher not found in this school"})
			}
			updates["teacher_id"] = *body.TeacherID
		}
	}
	if body.MaxMarks != nil {
		if *body.MaxMarks <= 0 {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "max_marks must be greater than zero"})
		}
		// Guard: can't lower max_marks below the highest existing result
		var maxExisting decimal.Decimal
		if err := h.DB.Model(&models.Result{}).
			Where("exam_id = ?", exam.ID).
			Select("COALESCE(MAX(marks), 0)").
			Scan(&maxExisting).Error; err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to check existing results"})
		}
		if decimal.NewFromInt(int64(*body.MaxMarks)).LessThan(maxExisting) {
			return c.Status(fiber.StatusConflict).JSON(fiber.Map{
				"error": "cannot lower max_marks below an already-recorded result",
			})
		}
		updates["max_marks"] = *body.MaxMarks
	}

	if len(updates) > 0 {
		if err := h.DB.Model(&exam).Updates(updates).Error; err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "update failed"})
		}
	}

	// reload
	if err := h.DB.Where("id = ? AND school_id = ?", id, schoolID).First(&exam).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "update succeeded but reload failed"})
	}
	return c.JSON(exam)
}

// DELETE /api/exams/:id  (soft delete)
func (h *ExamsHandler) Delete(c *fiber.Ctx) error {
	schoolID := middleware.GetSchoolID(c)
	id, err := strconv.Atoi(c.Params("id"))
	if err != nil || id <= 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid exam id"})
	}

	var exam models.Exam
	if err := h.DB.Where("id = ? AND school_id = ?", id, schoolID).First(&exam).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "exam not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "database error"})
	}
	if err := h.DB.Model(&exam).Update("is_active", false).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to delete exam"})
	}
	return c.JSON(fiber.Map{"message": "exam deactivated"})
}

// POST /api/exams/:id/results — bulk upsert marks
func (h *ExamsHandler) EnterResults(c *fiber.Ctx) error {
	schoolID := middleware.GetSchoolID(c)
	id, err := strconv.Atoi(c.Params("id"))
	if err != nil || id <= 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid exam id"})
	}

	var body EnterResultsRequest
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request"})
	}
	if len(body.Results) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "results cannot be empty"})
	}

	// Fetch exam (need max_marks + tenancy)
	var exam models.Exam
	if err := h.DB.Where("id = ? AND school_id = ?", id, schoolID).First(&exam).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "exam not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "database error"})
	}
	maxMarks := decimal.NewFromInt(int64(exam.MaxMarks))

	// Parse + validate each item up front
	type parsed struct {
		enrollmentID uint
		marks        decimal.Decimal
	}
	items := make([]parsed, 0, len(body.Results))
	seen := map[uint]bool{}
	enrollmentIDs := make([]uint, 0, len(body.Results))

	for _, r := range body.Results {
		if r.EnrollmentID == 0 {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid enrollment_id"})
		}
		if seen[r.EnrollmentID] {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "duplicate enrollment_id in results"})
		}
		seen[r.EnrollmentID] = true

		m, perr := decimal.NewFromString(r.Marks)
		if perr != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid marks value"})
		}
		if m.IsNegative() {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "marks cannot be negative"})
		}
		if m.GreaterThan(maxMarks) {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "marks cannot exceed exam max_marks"})
		}
		items = append(items, parsed{r.EnrollmentID, m})
		enrollmentIDs = append(enrollmentIDs, r.EnrollmentID)
	}

	// Verify every enrollment belongs to this school
	var validCount int64
	if err := h.DB.Model(&models.Enrollment{}).
		Where("school_id = ? AND id IN ?", schoolID, enrollmentIDs).
		Count(&validCount).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "database error"})
	}
	if int(validCount) != len(enrollmentIDs) {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "one or more enrollments not found in this school"})
	}

	// Upsert all in one transaction. Conflict on (exam_id, enrollment_id) updates marks.
	err = h.DB.Transaction(func(tx *gorm.DB) error {
		rows := make([]models.Result, 0, len(items))
		for _, it := range items {
			rows = append(rows, models.Result{
				SchoolID:     schoolID,
				ExamID:       exam.ID,
				EnrollmentID: it.enrollmentID,
				Marks:        it.marks,
			})
		}
		return tx.Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "exam_id"}, {Name: "enrollment_id"}},
			DoUpdates: clause.AssignmentColumns([]string{"marks", "updated_at"}),
		}).Create(&rows).Error
	})
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to save results"})
	}

	return c.JSON(fiber.Map{"message": "results saved", "count": len(items)})
}

// GET /api/exams/:id/results
func (h *ExamsHandler) ListResults(c *fiber.Ctx) error {
	schoolID := middleware.GetSchoolID(c)
	id, err := strconv.Atoi(c.Params("id"))
	if err != nil || id <= 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid exam id"})
	}

	// Confirm exam belongs to school
	var exam models.Exam
	if err := h.DB.Where("id = ? AND school_id = ?", id, schoolID).First(&exam).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "exam not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "database error"})
	}

	var results []models.Result
	if err := h.DB.Where("exam_id = ? AND school_id = ?", exam.ID, schoolID).
		Order("enrollment_id ASC").
		Find(&results).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to fetch results"})
	}
	return c.JSON(results)
}

// --- helpers ---

func (h *ExamsHandler) validateClassYear(classYearID, schoolID uint) error {
	var count int64
	if err := h.DB.Model(&models.ClassYear{}).
		Where("id = ? AND school_id = ?", classYearID, schoolID).
		Count(&count).Error; err != nil {
		return err
	}
	if count == 0 {
		return errors.New("class_year not found")
	}
	return nil
}

func (h *ExamsHandler) validateTeacher(teacherID, schoolID uint) error {
	var count int64
	if err := h.DB.Model(&models.Teacher{}).
		Where("id = ? AND school_id = ?", teacherID, schoolID).
		Count(&count).Error; err != nil {
		return err
	}
	if count == 0 {
		return errors.New("teacher not found")
	}
	return nil
}
