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
		"data":        students,
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
	return c.JSON(student)
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
