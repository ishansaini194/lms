package handlers

import (
	"errors"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/ishansaini194/lms/api/internal/auth"
	"github.com/ishansaini194/lms/api/internal/middleware"
	"github.com/ishansaini194/lms/api/internal/models"
	"gorm.io/gorm"
)

type StudentsHandler struct {
	DB *gorm.DB
}

func NewStudentsHandler(db *gorm.DB) *StudentsHandler {
	return &StudentsHandler{DB: db}
}

// studentListItem enriches a Student with class/section and a fee-status summary
// for the list and detail responses. The embedded Student flattens into the same
// JSON object, so existing fields are unchanged and these are added alongside.
type studentListItem struct {
	models.Student
	ClassLabel string `json:"class_label"`
	Section    string `json:"section"`
	FeeStatus  string `json:"fee_status"` // "paid" | "partial" | "unpaid" | "" (no fees)
	UserID     *uint  `json:"user_id"`    // linked login account, for password reset
}

// enrichStudents attaches class_label, section, and fee_status to a page of
// students using two batched queries (no N+1). Order is preserved.
func (h *StudentsHandler) enrichStudents(schoolID uint, students []models.Student) []studentListItem {
	items := make([]studentListItem, len(students))
	for i := range students {
		items[i] = studentListItem{Student: students[i]}
	}
	if len(students) == 0 {
		return items
	}

	ids := make([]uint, len(students))
	for i := range students {
		ids[i] = students[i].ID
	}

	// Resolve the current academic year (reuse the standard is_current lookup the
	// scheduler/dashboard use) so a student's class reflects this year, not a
	// stale enrollment from a prior year.
	var currentAY models.AcademicYear
	hasCurrentAY := h.DB.Where("school_id = ? AND is_current = ?", schoolID, true).First(&currentAY).Error == nil

	// 1. Class + section from the active enrollment → class_year → class.
	type classRow struct {
		StudentID uint
		Name      string
		Section   string
	}
	var classRows []classRow
	classQ := h.DB.Table("enrollments").
		Select("enrollments.student_id, classes.name, classes.section").
		Joins("JOIN class_years ON class_years.id = enrollments.class_year_id").
		Joins("JOIN classes ON classes.id = class_years.class_id").
		Where("enrollments.school_id = ? AND enrollments.student_id IN ? AND enrollments.status = ?",
			schoolID, ids, "active")
	if hasCurrentAY {
		classQ = classQ.Where("class_years.academic_year_id = ?", currentAY.ID)
	}
	classQ.Scan(&classRows)

	labelByStudent := map[uint]string{}
	sectionByStudent := map[uint]string{}
	for _, r := range classRows {
		label := r.Name
		if r.Section != "" {
			label += "-" + r.Section
		}
		labelByStudent[r.StudentID] = label
		sectionByStudent[r.StudentID] = r.Section
	}

	// 2. Fee status: count fees per student grouped by status (via enrollment join).
	type feeRow struct {
		StudentID uint
		Status    string
		Cnt       int
	}
	var feeRows []feeRow
	h.DB.Table("fees").
		Select("enrollments.student_id, fees.status, COUNT(*) as cnt").
		Joins("JOIN enrollments ON enrollments.id = fees.enrollment_id").
		Where("enrollments.school_id = ? AND enrollments.student_id IN ?", schoolID, ids).
		Group("enrollments.student_id, fees.status").
		Scan(&feeRows)

	statusByStudent := map[uint]map[string]int{}
	for _, r := range feeRows {
		if statusByStudent[r.StudentID] == nil {
			statusByStudent[r.StudentID] = map[string]int{}
		}
		statusByStudent[r.StudentID][r.Status] = r.Cnt
	}

	// 3. Linked login account per student (for password reset).
	type userRow struct {
		ID        uint
		StudentID uint
	}
	var userRows []userRow
	h.DB.Table("users").
		Select("id, student_id").
		Where("school_id = ? AND student_id IN ?", schoolID, ids).
		Scan(&userRows)
	userByStudent := map[uint]uint{}
	for _, u := range userRows {
		userByStudent[u.StudentID] = u.ID
	}

	for i := range items {
		sid := items[i].ID
		items[i].ClassLabel = labelByStudent[sid]
		items[i].Section = sectionByStudent[sid]
		items[i].FeeStatus = feeStatusLabel(statusByStudent[sid])
		if uid, ok := userByStudent[sid]; ok {
			id := uid
			items[i].UserID = &id
		}
	}
	return items
}

// feeStatusLabel derives a single status pill from a status→count map:
//   no fees → "", all paid → "paid", any partial or some paid → "partial",
//   otherwise (all unpaid) → "unpaid".
func feeStatusLabel(counts map[string]int) string {
	total := 0
	for _, c := range counts {
		total += c
	}
	if total == 0 {
		return ""
	}
	paid := counts["paid"]
	if paid == total {
		return "paid"
	}
	if counts["partial"] > 0 || paid > 0 {
		return "partial"
	}
	return "unpaid"
}

// GET /api/students
func (h *StudentsHandler) ListStudents(c *fiber.Ctx) error {
	schoolID := middleware.GetSchoolID(c)

	search := c.Query("search")
	classYearID := c.QueryInt("class_year_id", 0)
	includeInactive, _ := strconv.ParseBool(c.Query("include_inactive"))
	page := c.QueryInt("page", 1)
	limit := c.QueryInt("limit", 50)

	if limit > 100 {
		limit = 100
	}
	if limit < 1 {
		limit = 50
	}
	if page < 1 {
		page = 1
	}

	query := h.DB.Model(&models.Student{}).Where("students.school_id = ?", schoolID)

	if !includeInactive {
		query = query.Where("students.is_active = ?", true)
	}

	if classYearID > 0 {
		query = query.Joins("JOIN enrollments ON enrollments.student_id = students.id").
			Where("enrollments.class_year_id = ? AND enrollments.status = ?", classYearID, "active")
	}

	if search != "" {
		searchTerm := "%" + search + "%"
		query = query.Where(
			"students.name ILIKE ? OR students.admission_number ILIKE ? OR students.aadhar_number ILIKE ? OR students.email ILIKE ? OR students.father_name ILIKE ? OR students.mother_name ILIKE ?",
			searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm,
		)
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to count students"})
	}

	var students []models.Student
	offset := (page - 1) * limit
	if err := query.Order("students.name asc").Limit(limit).Offset(offset).Find(&students).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to fetch students"})
	}

	totalPages := int(total) / limit
	if int(total)%limit > 0 {
		totalPages++
	}

	return c.JSON(fiber.Map{
		"data":        h.enrichStudents(schoolID, students),
		"total":       total,
		"page":        page,
		"limit":       limit,
		"total_pages": totalPages,
	})
}

// GET /api/students/:id
func (h *StudentsHandler) GetStudent(c *fiber.Ctx) error {
	schoolID := middleware.GetSchoolID(c)

	id, err := strconv.Atoi(c.Params("id"))
	if err != nil || id <= 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid student id"})
	}

	var student models.Student
	if err := h.DB.Where("id = ? AND school_id = ?", id, schoolID).First(&student).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "student not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "database error"})
	}
	// Enrich with class_label / section / fee_status (same shape as the list rows).
	return c.JSON(h.enrichStudents(schoolID, []models.Student{student})[0])
}

// POST /api/students
func (h *StudentsHandler) CreateStudent(c *fiber.Ctx) error {
	schoolID := middleware.GetSchoolID(c)

	var body struct {
		AdmissionNumber string `json:"admission_no"`
		Name            string `json:"name"`
		Phone           string `json:"phone"`
		ClassYearID     uint   `json:"class_year_id"`

		EpunjabID     *string    `json:"epunjab_id,omitempty"`
		Gender        *string    `json:"gender,omitempty"`
		DateOfBirth   *time.Time `json:"dob,omitempty"`
		AadharNumber  *string    `json:"aadhar_no,omitempty"`
		FatherName    *string    `json:"father_name,omitempty"`
		FatherContact *string    `json:"father_contact,omitempty"`
		MotherName    *string    `json:"mother_name,omitempty"`
		MotherContact *string    `json:"mother_contact,omitempty"`
		Caste         *string    `json:"caste,omitempty"`
		Email         *string    `json:"email,omitempty"`
		Address       *string    `json:"address,omitempty"`
	}

	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request"})
	}

	body.Name = strings.TrimSpace(body.Name)
	body.AdmissionNumber = strings.TrimSpace(body.AdmissionNumber)
	body.Phone = strings.TrimSpace(body.Phone)

	if body.Name == "" || body.AdmissionNumber == "" || body.Phone == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "name, admission_no, and phone are required"})
	}
	if body.ClassYearID == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "class_year_id is required"})
	}

	hash, err := auth.HashPassword(auth.DefaultPassword)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to hash password"})
	}

	student := models.Student{
		SchoolID:        schoolID,
		AdmissionNumber: body.AdmissionNumber,
		Name:            body.Name,
		Phone:           &body.Phone,
		EpunjabID:       body.EpunjabID,
		Gender:          body.Gender,
		DateOfBirth:     body.DateOfBirth,
		AadharNumber:    body.AadharNumber,
		FatherName:      body.FatherName,
		FatherContact:   body.FatherContact,
		MotherName:      body.MotherName,
		MotherContact:   body.MotherContact,
		Caste:           body.Caste,
		Email:           body.Email,
		Address:         body.Address,
		IsActive:        true,
	}

	var user models.User
	var enrollment models.Enrollment

	err = h.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&student).Error; err != nil {
			return err
		}

		user = models.User{
			SchoolID:     schoolID,
			Username:     body.AdmissionNumber,
			PasswordHash: hash,
			Role:         "student",
			DisplayName:  &body.Name,
			StudentID:    &student.ID,
			IsActive:     true,
		}
		if err := tx.Create(&user).Error; err != nil {
			return err
		}

		enrollment = models.Enrollment{
			SchoolID:    schoolID,
			StudentID:   student.ID,
			ClassYearID: body.ClassYearID,
			Status:      "active",
		}
		return tx.Create(&enrollment).Error
	})

	if err != nil {
		if isUniqueViolation(err) {
			return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "admission_no or epunjab_id already exists"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to create student"})
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"message":       "student created",
		"student":       student,
		"user_id":       user.ID,
		"enrollment_id": enrollment.ID,
		"login_info": fiber.Map{
			"username": body.AdmissionNumber,
			"password": auth.DefaultPassword,
		},
	})
}

// PUT /api/students/:id
func (h *StudentsHandler) UpdateStudent(c *fiber.Ctx) error {
	schoolID := middleware.GetSchoolID(c)

	id, err := strconv.Atoi(c.Params("id"))
	if err != nil || id <= 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid student id"})
	}

	var student models.Student
	if err := h.DB.Where("id = ? AND school_id = ?", id, schoolID).First(&student).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "student not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "database error"})
	}

	var body struct {
		Name          *string    `json:"name,omitempty"`
		Gender        *string    `json:"gender,omitempty"`
		DateOfBirth   *time.Time `json:"dob,omitempty"`
		Phone         *string    `json:"phone,omitempty"`
		AadharNumber  *string    `json:"aadhar_no,omitempty"`
		FatherName    *string    `json:"father_name,omitempty"`
		FatherContact *string    `json:"father_contact,omitempty"`
		MotherName    *string    `json:"mother_name,omitempty"`
		MotherContact *string    `json:"mother_contact,omitempty"`
		Caste         *string    `json:"caste,omitempty"`
		Email         *string    `json:"email,omitempty"`
		Address       *string    `json:"address,omitempty"`
		EpunjabID     *string    `json:"epunjab_id,omitempty"`
	}

	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request"})
	}

	updates := map[string]interface{}{}

	if body.Name != nil {
		trimmed := strings.TrimSpace(*body.Name)
		if trimmed == "" {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "name cannot be empty"})
		}
		updates["name"] = trimmed
	}

	if body.Gender != nil {
		updates["gender"] = body.Gender
	}
	if body.DateOfBirth != nil {
		updates["date_of_birth"] = body.DateOfBirth
	}
	if body.Phone != nil {
		updates["phone"] = body.Phone
	}
	if body.AadharNumber != nil {
		updates["aadhar_number"] = body.AadharNumber
	}
	if body.FatherName != nil {
		updates["father_name"] = body.FatherName
	}
	if body.FatherContact != nil {
		updates["father_contact"] = body.FatherContact
	}
	if body.MotherName != nil {
		updates["mother_name"] = body.MotherName
	}
	if body.MotherContact != nil {
		updates["mother_contact"] = body.MotherContact
	}
	if body.Caste != nil {
		updates["caste"] = body.Caste
	}
	if body.Email != nil {
		updates["email"] = body.Email
	}
	if body.Address != nil {
		updates["address"] = body.Address
	}
	if body.EpunjabID != nil {
		updates["epunjab_id"] = body.EpunjabID
	}

	if len(updates) == 0 {
		return c.JSON(student)
	}

	if err := h.DB.Model(&student).Updates(updates).Error; err != nil {
		if isUniqueViolation(err) {
			return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "epunjab_id already exists"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "update failed"})
	}

	if err := h.DB.First(&student, student.ID).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "update succeeded but reload failed"})
	}

	return c.JSON(student)
}

// DELETE /api/students/:id
func (h *StudentsHandler) DeleteStudent(c *fiber.Ctx) error {
	schoolID := middleware.GetSchoolID(c)

	id, err := strconv.Atoi(c.Params("id"))
	if err != nil || id <= 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid student id"})
	}

	err = h.DB.Transaction(func(tx *gorm.DB) error {
		result := tx.Model(&models.Student{}).
			Where("id = ? AND school_id = ?", id, schoolID).
			Update("is_active", false)
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected == 0 {
			return gorm.ErrRecordNotFound
		}

		return tx.Model(&models.User{}).
			Where("student_id = ? AND school_id = ?", id, schoolID).
			Update("is_active", false).Error
	})

	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "student not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to deactivate"})
	}
	return c.JSON(fiber.Map{"message": "student deactivated"})
}

// POST /api/students/:id/reactivate — flips a soft-deleted student back to
// active (and re-enables their login). Mirrors DeleteStudent's structure.
func (h *StudentsHandler) ReactivateStudent(c *fiber.Ctx) error {
	schoolID := middleware.GetSchoolID(c)

	id, err := strconv.Atoi(c.Params("id"))
	if err != nil || id <= 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid student id"})
	}

	err = h.DB.Transaction(func(tx *gorm.DB) error {
		result := tx.Model(&models.Student{}).
			Where("id = ? AND school_id = ?", id, schoolID).
			Update("is_active", true)
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected == 0 {
			return gorm.ErrRecordNotFound
		}

		return tx.Model(&models.User{}).
			Where("student_id = ? AND school_id = ?", id, schoolID).
			Update("is_active", true).Error
	})

	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "student not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to reactivate"})
	}

	var student models.Student
	if err := h.DB.Where("id = ? AND school_id = ?", id, schoolID).First(&student).Error; err != nil {
		return c.JSON(fiber.Map{"ok": true})
	}
	return c.JSON(h.enrichStudents(schoolID, []models.Student{student})[0])
}
