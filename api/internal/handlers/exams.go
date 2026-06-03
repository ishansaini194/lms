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
	ExamTermID  uint       `json:"exam_term_id"`
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

// examListItem enriches an Exam with class + teacher labels for the list/detail
// views. The embedded Exam flattens into the same JSON object.
type examListItem struct {
	models.Exam
	ClassYearLabel string  `json:"class_year_label"` // "2-A · 2026-27"
	ClassLabel     string  `json:"class_label"`      // "2-A"
	TeacherName    *string `json:"teacher_name"`     // nil if unassigned
	ExamTermName   *string `json:"exam_term_name"`   // nil if no term (legacy exams)
}

// enrichExams attaches class/teacher labels via two batched queries (no N+1).
// Order is preserved. The Exam model has no relation fields, so we join by id.
func (h *ExamsHandler) enrichExams(schoolID uint, exams []models.Exam) []examListItem {
	items := make([]examListItem, len(exams))
	for i := range exams {
		items[i] = examListItem{Exam: exams[i]}
	}
	if len(exams) == 0 {
		return items
	}

	cyIDs := make([]uint, 0, len(exams))
	teacherIDs := make([]uint, 0, len(exams))
	termIDs := make([]uint, 0, len(exams))
	for _, e := range exams {
		cyIDs = append(cyIDs, e.ClassYearID)
		if e.TeacherID != nil {
			teacherIDs = append(teacherIDs, *e.TeacherID)
		}
		if e.ExamTermID != 0 {
			termIDs = append(termIDs, e.ExamTermID)
		}
	}

	// class_year → class label + year label.
	type cyRow struct {
		ID        uint
		Name      string
		Section   string
		YearLabel string
	}
	var cyRows []cyRow
	h.DB.Table("class_years").
		Select("class_years.id, classes.name, classes.section, academic_years.year_label").
		Joins("JOIN classes ON classes.id = class_years.class_id").
		Joins("JOIN academic_years ON academic_years.id = class_years.academic_year_id").
		Where("class_years.school_id = ? AND class_years.id IN ?", schoolID, cyIDs).
		Scan(&cyRows)
	type cyLabels struct{ classLabel, yearLabel string }
	byCY := map[uint]cyLabels{}
	for _, r := range cyRows {
		cl := r.Name
		if r.Section != "" {
			cl += "-" + r.Section
		}
		byCY[r.ID] = cyLabels{classLabel: cl, yearLabel: r.YearLabel}
	}

	// teacher → name.
	teacherByID := map[uint]string{}
	if len(teacherIDs) > 0 {
		type tRow struct {
			ID   uint
			Name string
		}
		var tRows []tRow
		h.DB.Table("teachers").
			Select("id, name").
			Where("school_id = ? AND id IN ?", schoolID, teacherIDs).
			Scan(&tRows)
		for _, t := range tRows {
			teacherByID[t.ID] = t.Name
		}
	}

	// exam_term → name.
	termByID := map[uint]string{}
	if len(termIDs) > 0 {
		type termRow struct {
			ID   uint
			Name string
		}
		var termRows []termRow
		h.DB.Table("exam_terms").
			Select("id, name").
			Where("school_id = ? AND id IN ?", schoolID, termIDs).
			Scan(&termRows)
		for _, t := range termRows {
			termByID[t.ID] = t.Name
		}
	}

	for i := range items {
		if l, ok := byCY[items[i].ClassYearID]; ok {
			items[i].ClassLabel = l.classLabel
			items[i].ClassYearLabel = l.classLabel
			if l.yearLabel != "" {
				items[i].ClassYearLabel = l.classLabel + " · " + l.yearLabel
			}
		}
		if items[i].TeacherID != nil {
			if name, ok := teacherByID[*items[i].TeacherID]; ok {
				n := name
				items[i].TeacherName = &n
			}
		}
		if items[i].ExamTermID != 0 {
			if name, ok := termByID[items[i].ExamTermID]; ok {
				n := name
				items[i].ExamTermName = &n
			}
		}
	}
	return items
}

// GET /api/exams?include_inactive=&class_year_id=&teacher_id=
func (h *ExamsHandler) List(c *fiber.Ctx) error {
	schoolID := middleware.GetSchoolID(c)

	includeInactive, _ := strconv.ParseBool(c.Query("include_inactive"))

	classYearID := c.QueryInt("class_year_id", 0)

	teacherID := c.QueryInt("teacher_id", 0)

	examTermID := c.QueryInt("exam_term_id", 0)

	query := h.DB.Model(&models.Exam{}).Where("school_id = ?", schoolID)

	if isTeacher(c) {
		query = query.Where("teacher_id = ?", middleware.GetTeacherID(c))
	}
	if !includeInactive {
		query = query.Where("is_active = ?", true)
	}
	if classYearID > 0 {
		query = query.Where("class_year_id = ?", classYearID)
	}
	if teacherID > 0 {
		query = query.Where("teacher_id = ?", teacherID)
	}
	if examTermID > 0 {
		query = query.Where("exam_term_id = ?", examTermID)
	}

	var exams []models.Exam
	if err := query.Order("exam_date DESC NULLS LAST, id DESC").Find(&exams).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to fetch exams"})
	}
	return c.JSON(h.enrichExams(schoolID, exams))
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

	// Teacher can only view their own exam
	if isTeacher(c) {
		tid := middleware.GetTeacherID(c)
		if exam.TeacherID == nil || *exam.TeacherID != tid {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "exam not found"})
		}
	}

	return c.JSON(h.enrichExams(schoolID, []models.Exam{exam})[0])
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
	if body.ExamTermID == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "exam_term_id is required"})
	}

	// class_year belongs to school
	if err := h.validateClassYear(body.ClassYearID, schoolID); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "class_year not found in this school"})
	}

	// exam_term belongs to this school, is active, and shares the class-year's
	// academic year (a term groups exams within one year).
	cyYearID, err := h.classYearAcademicYearID(body.ClassYearID, schoolID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "database error"})
	}
	var term models.ExamTerm
	if err := h.DB.Where("id = ? AND school_id = ? AND is_active = ?", body.ExamTermID, schoolID, true).
		First(&term).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "exam_term not found in this school"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "database error"})
	}
	if term.AcademicYearID != cyYearID {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "exam_term belongs to a different academic year than the class"})
	}

	if isTeacher(c) {
		if !teacherOwnsClassYear(h.DB, middleware.GetTeacherID(c), body.ClassYearID, schoolID) {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "you can only create exams for your own classes"})
		}
	}

	// teacher (optional) belongs to school
	if isTeacher(c) {
		tid := middleware.GetTeacherID(c)
		body.TeacherID = &tid
	} else if body.TeacherID != nil {
		if err := h.validateTeacher(*body.TeacherID, schoolID); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "teacher not found in this school"})
		}
	}

	exam := models.Exam{
		SchoolID:    schoolID,
		ClassYearID: body.ClassYearID,
		ExamTermID:  body.ExamTermID,
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
			// only admin can unassign (clear) the teacher
			if isTeacher(c) {
				return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "you cannot unassign this exam"})
			}
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

	if isTeacher(c) {
		tid := middleware.GetTeacherID(c)
		if exam.TeacherID == nil || *exam.TeacherID != tid {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "exam not found"})
		}
	}

	// Teacher can only delete their own exam
	if isTeacher(c) {
		tid := middleware.GetTeacherID(c)
		if exam.TeacherID == nil || *exam.TeacherID != tid {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "exam not found"})
		}
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

	// Teacher can only enter results for their own exam
	if isTeacher(c) {
		tid := middleware.GetTeacherID(c)
		if exam.TeacherID == nil || *exam.TeacherID != tid {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "exam not found"})
		}
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

	// Teacher can only view results for their own exam
	if isTeacher(c) {
		tid := middleware.GetTeacherID(c)
		if exam.TeacherID == nil || *exam.TeacherID != tid {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "exam not found"})
		}
	}

	// Roster: every active enrollment in the exam's class_year, with student.
	type rosterRow struct {
		EnrollmentID uint
		StudentName  string
		AdmissionNo  string
	}
	var roster []rosterRow
	h.DB.Table("enrollments").
		Select("enrollments.id as enrollment_id, students.name as student_name, students.admission_number as admission_no").
		Joins("JOIN students ON students.id = enrollments.student_id").
		Where("enrollments.school_id = ? AND enrollments.class_year_id = ? AND enrollments.status = ?",
			schoolID, exam.ClassYearID, "active").
		Order("students.name asc").
		Scan(&roster)

	// Existing marks, keyed by enrollment.
	var results []models.Result
	if err := h.DB.Where("exam_id = ? AND school_id = ?", exam.ID, schoolID).
		Find(&results).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to fetch results"})
	}
	marksByEnr := map[uint]string{}
	for _, r := range results {
		marksByEnr[r.EnrollmentID] = r.Marks.String()
	}

	// One row per active student; marks null until entered.
	rows := make([]fiber.Map, 0, len(roster))
	for _, e := range roster {
		var marks interface{} = nil
		if m, ok := marksByEnr[e.EnrollmentID]; ok {
			marks = m
		}
		rows = append(rows, fiber.Map{
			"enrollment_id": e.EnrollmentID,
			"student_name":  e.StudentName,
			"admission_no":  e.AdmissionNo,
			"marks":         marks,
		})
	}

	return c.JSON(fiber.Map{
		"exam": h.enrichExams(schoolID, []models.Exam{exam})[0],
		"rows": rows,
	})
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

// classYearAcademicYearID returns the academic_year_id of a school's class_year.
// Used to confirm an exam's term belongs to the same academic year as its class.
func (h *ExamsHandler) classYearAcademicYearID(classYearID, schoolID uint) (uint, error) {
	var yearID uint
	if err := h.DB.Model(&models.ClassYear{}).
		Where("id = ? AND school_id = ?", classYearID, schoolID).
		Pluck("academic_year_id", &yearID).Error; err != nil {
		return 0, err
	}
	return yearID, nil
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
