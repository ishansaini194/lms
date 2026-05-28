package handlers

import (
	"errors"
	"strconv"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/ishansaini194/lms/api/internal/middleware"
	"github.com/ishansaini194/lms/api/internal/models"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type AssessmentsHandler struct {
	DB *gorm.DB
}

func NewAssessmentsHandler(db *gorm.DB) *AssessmentsHandler {
	return &AssessmentsHandler{DB: db}
}

type CreateAssessmentRequest struct {
	ExamID    uint   `json:"exam_id"`
	TeacherID uint   `json:"teacher_id"`
	Name      string `json:"name"`
	MaxMarks  int    `json:"max_marks"`
}

type UpdateAssessmentRequest struct {
	TeacherID *uint   `json:"teacher_id,omitempty"`
	Name      *string `json:"name,omitempty"`
	MaxMarks  *int    `json:"max_marks,omitempty"`
}

type AssessmentMarkItem struct {
	EnrollmentID uint   `json:"enrollment_id"`
	Marks        string `json:"marks"`
}

type EnterAssessmentMarksRequest struct {
	Marks []AssessmentMarkItem `json:"marks"`
}

// GET /api/assessments?exam_id=&include_inactive=&teacher_id=
func (h *AssessmentsHandler) List(c *fiber.Ctx) error {
	schoolID := middleware.GetSchoolID(c)
	includeInactive, _ := strconv.ParseBool(c.Query("include_inactive"))
	examID := c.QueryInt("exam_id", 0)
	teacherID := c.QueryInt("teacher_id", 0)

	query := h.DB.Model(&models.Assessment{}).Where("school_id = ?", schoolID)
	if !includeInactive {
		query = query.Where("is_active = ?", true)
	}
	if examID > 0 {
		query = query.Where("exam_id = ?", examID)
	}
	if teacherID > 0 {
		query = query.Where("teacher_id = ?", teacherID)
	}
	if isTeacher(c) {
		query = query.Where("teacher_id = ?", middleware.GetTeacherID(c))
	}

	var assessments []models.Assessment
	if err := query.Order("id DESC").Find(&assessments).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to fetch assessments"})
	}
	return c.JSON(assessments)
}

// GET /api/assessments/:id
func (h *AssessmentsHandler) GetOne(c *fiber.Ctx) error {
	schoolID := middleware.GetSchoolID(c)
	id, err := strconv.Atoi(c.Params("id"))
	if err != nil || id <= 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid assessment id"})
	}

	var a models.Assessment
	if err := h.DB.Where("id = ? AND school_id = ?", id, schoolID).First(&a).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "assessment not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "database error"})
	}
	if isTeacher(c) {
		if a.TeacherID != middleware.GetTeacherID(c) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "assessment not found"})
		}
	}
	return c.JSON(a)
}

// POST /api/assessments
func (h *AssessmentsHandler) Create(c *fiber.Ctx) error {
	schoolID := middleware.GetSchoolID(c)

	var body CreateAssessmentRequest
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request"})
	}

	if body.ExamID == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "exam_id is required"})
	}
	// Teacher creating: force to themselves. Admin: must provide a valid teacher_id.
	if isTeacher(c) {
		body.TeacherID = middleware.GetTeacherID(c)
	} else if body.TeacherID == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "teacher_id is required"})
	}
	body.Name = strings.TrimSpace(body.Name)
	if body.Name == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "name is required"})
	}
	if body.MaxMarks <= 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "max_marks must be greater than zero"})
	}

	// exam belongs to school
	if err := h.validateExam(body.ExamID, schoolID); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "exam not found in this school"})
	}
	// Teacher can only create assessments under their own exam
	if isTeacher(c) {
		if !teacherOwnsExam(h.DB, middleware.GetTeacherID(c), body.ExamID, schoolID) {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "you can only add assessments to your own exams"})
		}
	}
	// teacher belongs to school
	if err := h.validateTeacher(body.TeacherID, schoolID); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "teacher not found in this school"})
	}

	a := models.Assessment{
		SchoolID:  schoolID,
		ExamID:    body.ExamID,
		TeacherID: body.TeacherID,
		Name:      body.Name,
		MaxMarks:  body.MaxMarks,
		IsActive:  true,
	}
	if err := h.DB.Create(&a).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to create assessment"})
	}
	return c.Status(fiber.StatusCreated).JSON(a)
}

// PUT /api/assessments/:id
func (h *AssessmentsHandler) Update(c *fiber.Ctx) error {
	schoolID := middleware.GetSchoolID(c)
	id, err := strconv.Atoi(c.Params("id"))
	if err != nil || id <= 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid assessment id"})
	}

	var body UpdateAssessmentRequest
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request"})
	}

	var a models.Assessment
	if err := h.DB.Where("id = ? AND school_id = ?", id, schoolID).First(&a).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "assessment not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "database error"})
	}
	if isTeacher(c) {
		if a.TeacherID != middleware.GetTeacherID(c) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "assessment not found"})
		}
	}

	updates := map[string]interface{}{}
	if body.Name != nil {
		n := strings.TrimSpace(*body.Name)
		if n == "" {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "name cannot be empty"})
		}
		updates["name"] = n
	}
	if body.TeacherID != nil {
		// teacher_id is NOT NULL on assessments — 0 is invalid, not a "clear"
		if *body.TeacherID == 0 {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "teacher_id cannot be empty"})
		}
		if err := h.validateTeacher(*body.TeacherID, schoolID); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "teacher not found in this school"})
		}
		updates["teacher_id"] = *body.TeacherID
	}
	if body.MaxMarks != nil {
		if *body.MaxMarks <= 0 {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "max_marks must be greater than zero"})
		}
		var maxExisting decimal.Decimal
		if err := h.DB.Model(&models.AssessmentMark{}).
			Where("assessment_id = ?", a.ID).
			Select("COALESCE(MAX(marks), 0)").
			Scan(&maxExisting).Error; err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to check existing marks"})
		}
		if decimal.NewFromInt(int64(*body.MaxMarks)).LessThan(maxExisting) {
			return c.Status(fiber.StatusConflict).JSON(fiber.Map{
				"error": "cannot lower max_marks below an already-recorded mark",
			})
		}
		updates["max_marks"] = *body.MaxMarks
	}

	if len(updates) > 0 {
		if err := h.DB.Model(&a).Updates(updates).Error; err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "update failed"})
		}
	}

	if err := h.DB.Where("id = ? AND school_id = ?", id, schoolID).First(&a).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "update succeeded but reload failed"})
	}
	return c.JSON(a)
}

// DELETE /api/assessments/:id  (soft delete)
func (h *AssessmentsHandler) Delete(c *fiber.Ctx) error {
	schoolID := middleware.GetSchoolID(c)
	id, err := strconv.Atoi(c.Params("id"))
	if err != nil || id <= 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid assessment id"})
	}

	var a models.Assessment
	if err := h.DB.Where("id = ? AND school_id = ?", id, schoolID).First(&a).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "assessment not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "database error"})
	}
	if isTeacher(c) {
		if a.TeacherID != middleware.GetTeacherID(c) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "assessment not found"})
		}
	}
	if err := h.DB.Model(&a).Update("is_active", false).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to delete assessment"})
	}
	return c.JSON(fiber.Map{"message": "assessment deactivated"})
}

// POST /api/assessments/:id/marks — bulk upsert
func (h *AssessmentsHandler) EnterMarks(c *fiber.Ctx) error {
	schoolID := middleware.GetSchoolID(c)
	id, err := strconv.Atoi(c.Params("id"))
	if err != nil || id <= 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid assessment id"})
	}

	var body EnterAssessmentMarksRequest
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request"})
	}
	if len(body.Marks) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "marks cannot be empty"})
	}

	var a models.Assessment
	if err := h.DB.Where("id = ? AND school_id = ?", id, schoolID).First(&a).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "assessment not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "database error"})
	}
	if isTeacher(c) {
		if a.TeacherID != middleware.GetTeacherID(c) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "assessment not found"})
		}
	}
	maxMarks := decimal.NewFromInt(int64(a.MaxMarks))

	type parsed struct {
		enrollmentID uint
		marks        decimal.Decimal
	}
	items := make([]parsed, 0, len(body.Marks))
	seen := map[uint]bool{}
	enrollmentIDs := make([]uint, 0, len(body.Marks))

	for _, r := range body.Marks {
		if r.EnrollmentID == 0 {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid enrollment_id"})
		}
		if seen[r.EnrollmentID] {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "duplicate enrollment_id in marks"})
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
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "marks cannot exceed assessment max_marks"})
		}
		items = append(items, parsed{r.EnrollmentID, m})
		enrollmentIDs = append(enrollmentIDs, r.EnrollmentID)
	}

	var validCount int64
	if err := h.DB.Model(&models.Enrollment{}).
		Where("school_id = ? AND id IN ?", schoolID, enrollmentIDs).
		Count(&validCount).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "database error"})
	}
	if int(validCount) != len(enrollmentIDs) {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "one or more enrollments not found in this school"})
	}

	err = h.DB.Transaction(func(tx *gorm.DB) error {
		rows := make([]models.AssessmentMark, 0, len(items))
		for _, it := range items {
			rows = append(rows, models.AssessmentMark{
				SchoolID:     schoolID,
				AssessmentID: a.ID,
				EnrollmentID: it.enrollmentID,
				Marks:        it.marks,
			})
		}
		return tx.Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "assessment_id"}, {Name: "enrollment_id"}},
			DoUpdates: clause.AssignmentColumns([]string{"marks", "updated_at"}),
		}).Create(&rows).Error
	})
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to save marks"})
	}

	return c.JSON(fiber.Map{"message": "marks saved", "count": len(items)})
}

// GET /api/assessments/:id/marks
func (h *AssessmentsHandler) ListMarks(c *fiber.Ctx) error {
	schoolID := middleware.GetSchoolID(c)
	id, err := strconv.Atoi(c.Params("id"))
	if err != nil || id <= 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid assessment id"})
	}

	var a models.Assessment
	if err := h.DB.Where("id = ? AND school_id = ?", id, schoolID).First(&a).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "assessment not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "database error"})
	}
	if isTeacher(c) {
		if a.TeacherID != middleware.GetTeacherID(c) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "assessment not found"})
		}
	}

	var marks []models.AssessmentMark
	if err := h.DB.Where("assessment_id = ? AND school_id = ?", a.ID, schoolID).
		Order("enrollment_id ASC").
		Find(&marks).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to fetch marks"})
	}
	return c.JSON(marks)
}

// --- helpers ---

func (h *AssessmentsHandler) validateExam(examID, schoolID uint) error {
	var count int64
	if err := h.DB.Model(&models.Exam{}).
		Where("id = ? AND school_id = ?", examID, schoolID).
		Count(&count).Error; err != nil {
		return err
	}
	if count == 0 {
		return errors.New("exam not found")
	}
	return nil
}

func (h *AssessmentsHandler) validateTeacher(teacherID, schoolID uint) error {
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
