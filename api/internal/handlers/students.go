package handlers

import (
	"errors"
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

// GET /api/students
func (h *StudentsHandler) ListStudents(c *fiber.Ctx) error {
	schoolID := middleware.GetSchoolID(c)

	// Read query params
	search := c.Query("search")
	classYearID := c.QueryInt("class_year_id", 0)
	includeInactive := c.Query("include_inactive") == "true"
	page := c.QueryInt("page", 1)
	limit := c.QueryInt("limit", 50)

	// Safety bounds
	if limit > 100 {
		limit = 100
	}
	if limit < 1 {
		limit = 50
	}
	if page < 1 {
		page = 1
	}

	// Base query — tenancy filter
	query := h.DB.Model(&models.Student{}).Where("students.school_id = ?", schoolID)

	// Active filter
	if !includeInactive {
		query = query.Where("students.is_active = ?", true)
	}

	// Class filter — join with enrollments
	if classYearID > 0 {
		query = query.Joins("JOIN enrollments ON enrollments.student_id = students.id").
			Where("enrollments.class_year_id = ? AND enrollments.status = ?", classYearID, "active")
	}

	// Search filter — match across multiple fields
	if search != "" {
		searchTerm := "%" + search + "%"
		query = query.Where(
			"students.name ILIKE ? OR students.admission_number ILIKE ? OR students.aadhar_number ILIKE ? OR students.email ILIKE ? OR students.father_name ILIKE ? OR students.mother_name ILIKE ?",
			searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm,
		)
	}

	// Count total matching records (before pagination)
	var total int64
	if err := query.Count(&total).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to count students"})
	}

	// Fetch paginated results
	var students []models.Student
	offset := (page - 1) * limit
	if err := query.Order("students.name asc").Limit(limit).Offset(offset).Find(&students).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to fetch students"})
	}

	// Calculate total pages
	totalPages := int(total) / limit
	if int(total)%limit > 0 {
		totalPages++
	}

	return c.JSON(fiber.Map{
		"data":        students,
		"total":       total,
		"page":        page,
		"limit":       limit,
		"total_pages": totalPages,
	})
}

// GET /api/students/:id
func (h *StudentsHandler) GetStudent(c *fiber.Ctx) error {
	id := c.Params("id")
	schoolID := middleware.GetSchoolID(c)

	var student models.Student
	if err := h.DB.Where("id = ? AND school_id = ?", id, schoolID).First(&student).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "student not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "database error"})
	}
	return c.JSON(student)
}

// POST /api/students
func (h *StudentsHandler) CreateStudent(c *fiber.Ctx) error {
	schoolID := middleware.GetSchoolID(c)

	var body struct {
		AdmissionNumber string `json:"admission_no"`
		Name            string `json:"name"`
		Phone           string `json:"phone"`
		Password        string `json:"password"`
		ClassYearID     uint   `json:"class_year_id"`

		// Optional fields
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

	// Validation
	if body.Name == "" || body.AdmissionNumber == "" || body.Phone == "" || body.Password == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "name, admission_no, phone, password are required"})
	}
	if body.ClassYearID == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "class_year_id is required"})
	}
	if len(body.Password) < 6 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "password must be at least 6 characters"})
	}

	hash, err := auth.HashPassword(body.Password)
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
		// 1. Create student
		if err := tx.Create(&student).Error; err != nil {
			return err
		}

		// 2. Create user account (username = admission_number)
		user = models.User{
			SchoolID:     schoolID,
			Username:     body.AdmissionNumber,
			PasswordHash: hash,
			Role:         "student",
			StudentID:    &student.ID,
			IsActive:     true,
		}
		if err := tx.Create(&user).Error; err != nil {
			return err
		}

		// 3. Create enrollment
		enrollment = models.Enrollment{
			SchoolID:    schoolID,
			StudentID:   student.ID,
			ClassYearID: body.ClassYearID,
			RollNumber:  body.RollNumber,
			Status:      "active",
		}
		if err := tx.Create(&enrollment).Error; err != nil {
			return err
		}

		return nil
	})

	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to create student (admission_number, username, or roll_number may already exist)"})
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"message":       "student created",
		"student":       student,
		"user_id":       user.ID,
		"enrollment_id": enrollment.ID,
		"login_info": fiber.Map{
			"username": body.AdmissionNumber,
			"password": body.Password,
		},
	})
}

// PUT /api/students/:id
func (h *StudentsHandler) UpdateStudent(c *fiber.Ctx) error {
	id := c.Params("id")
	schoolID := middleware.GetSchoolID(c)

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

	if err := h.DB.Model(&student).Updates(body).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "update failed"})
	}

	return c.JSON(student)
}

// DELETE /api/students/:id
func (h *StudentsHandler) DeleteStudent(c *fiber.Ctx) error {
	id := c.Params("id")
	schoolID := middleware.GetSchoolID(c)

	err := h.DB.Transaction(func(tx *gorm.DB) error {
		// Step 1: Deactivate the student
		result := tx.Model(&models.Student{}).
			Where("id = ? AND school_id = ?", id, schoolID).
			Update("is_active", false)

		if result.Error != nil {
			return result.Error
		}

		if result.RowsAffected == 0 {
			return gorm.ErrRecordNotFound
		}

		// Step 2: Deactivate the linked user account
		if err := tx.Model(&models.User{}).
			Where("student_id = ? AND school_id = ?", id, schoolID).
			Update("is_active", false).Error; err != nil {
			return err
		}

		return nil
	})

	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "student not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to deactivate"})
	}
	return c.JSON(fiber.Map{"message": "student deactivated"})
}
