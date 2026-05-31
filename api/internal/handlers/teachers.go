package handlers

import (
	"errors"
	"strconv"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/ishansaini194/lms/api/internal/auth"
	"github.com/ishansaini194/lms/api/internal/middleware"
	"github.com/ishansaini194/lms/api/internal/models"
	"gorm.io/gorm"
)

type TeachersHandler struct {
	DB *gorm.DB
}

func NewTeachersHandler(db *gorm.DB) *TeachersHandler {
	return &TeachersHandler{DB: db}
}

// GET /api/teachers
func (h *TeachersHandler) ListTeachers(c *fiber.Ctx) error {
	schoolID := middleware.GetSchoolID(c)
	includeInactive, _ := strconv.ParseBool(c.Query("include_inactive"))

	query := h.DB.Where("school_id = ?", schoolID)
	if !includeInactive {
		query = query.Where("is_active = ?", true)
	}

	var teachers []models.Teacher
	if err := query.Order("name asc").Find(&teachers).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to fetch teachers"})
	}
	return c.JSON(teachers)
}

// GET /api/teachers/:id
func (h *TeachersHandler) GetTeacher(c *fiber.Ctx) error {
	schoolID := middleware.GetSchoolID(c)

	id, err := strconv.Atoi(c.Params("id"))
	if err != nil || id <= 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid teacher id"})
	}

	var teacher models.Teacher
	if err := h.DB.Where("id = ? AND school_id = ?", id, schoolID).First(&teacher).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "teacher not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "database error"})
	}

	return c.JSON(teacher)
}

// POST /api/teachers
func (h *TeachersHandler) CreateTeacher(c *fiber.Ctx) error {
	schoolID := middleware.GetSchoolID(c)

	var body struct {
		Name          string `json:"name"`
		EmployeeID    string `json:"employee_id"`
		Phone         string `json:"phone"`
		Email         string `json:"email"`
		Subject       string `json:"subject"`
		Qualification string `json:"qualification"`
		Username      string `json:"username"`
	}

	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request"})
	}

	body.Name = strings.TrimSpace(body.Name)
	body.EmployeeID = strings.TrimSpace(body.EmployeeID)
	body.Username = strings.TrimSpace(body.Username)
	body.Phone = strings.TrimSpace(body.Phone)
	body.Email = strings.TrimSpace(body.Email)
	body.Subject = strings.TrimSpace(body.Subject)
	body.Qualification = strings.TrimSpace(body.Qualification)

	if body.Name == "" || body.EmployeeID == "" || body.Username == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "name, employee_id, and username are required"})
	}

	hash, err := auth.HashPassword(auth.DefaultPassword)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to hash password"})
	}

	teacher := models.Teacher{
		SchoolID:      schoolID,
		Name:          body.Name,
		EmployeeID:    body.EmployeeID,
		Phone:         body.Phone,
		Email:         body.Email,
		Subject:       body.Subject,
		Qualification: body.Qualification,
		IsActive:      true,
	}

	user := models.User{
		SchoolID:     schoolID,
		Username:     body.Username,
		PasswordHash: hash,
		Role:         "teacher",
		DisplayName:  &body.Name,
		IsActive:     true,
	}

	err = h.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&teacher).Error; err != nil {
			return err
		}
		user.TeacherID = &teacher.ID
		return tx.Create(&user).Error
	})

	if err != nil {
		if isUniqueViolation(err) {
			return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "username or employee_id already exists"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to create teacher"})
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"message":    "teacher created",
		"teacher_id": teacher.ID,
		"user_id":    user.ID,
		"login_info": fiber.Map{
			"username": body.Username,
			"password": auth.DefaultPassword,
		},
	})
}

// PUT /api/teachers/:id
func (h *TeachersHandler) UpdateTeacher(c *fiber.Ctx) error {
	schoolID := middleware.GetSchoolID(c)

	id, err := strconv.Atoi(c.Params("id"))
	if err != nil || id <= 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid teacher id"})
	}

	var teacher models.Teacher
	if err := h.DB.Where("id = ? AND school_id = ?", id, schoolID).First(&teacher).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "teacher not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "database error"})
	}

	var body struct {
		Name          *string `json:"name,omitempty"`
		Phone         *string `json:"phone,omitempty"`
		Email         *string `json:"email,omitempty"`
		Subject       *string `json:"subject,omitempty"`
		Qualification *string `json:"qualification,omitempty"`
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

	if body.Phone != nil {
		updates["phone"] = *body.Phone
	}
	if body.Email != nil {
		updates["email"] = *body.Email
	}
	if body.Subject != nil {
		updates["subject"] = *body.Subject
	}
	if body.Qualification != nil {
		updates["qualification"] = *body.Qualification
	}

	if len(updates) == 0 {
		return c.JSON(teacher) // nothing to update; return current state
	}

	if err := h.DB.Model(&teacher).Updates(updates).Error; err != nil {
		if isUniqueViolation(err) {
			return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "employee_id already exists"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "update failed"})
	}

	if err := h.DB.First(&teacher, teacher.ID).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "update succeeded but reload failed"})
	}

	return c.JSON(teacher)
}

// DELETE /api/teachers/:id
func (h *TeachersHandler) DeleteTeacher(c *fiber.Ctx) error {
	schoolID := middleware.GetSchoolID(c)

	id, err := strconv.Atoi(c.Params("id"))
	if err != nil || id <= 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid teacher id"})
	}

	err = h.DB.Transaction(func(tx *gorm.DB) error {
		result := tx.Model(&models.Teacher{}).
			Where("id = ? AND school_id = ?", id, schoolID).
			Update("is_active", false)
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected == 0 {
			return gorm.ErrRecordNotFound
		}

		return tx.Model(&models.User{}).
			Where("teacher_id = ? AND school_id = ?", id, schoolID).
			Update("is_active", false).Error
	})

	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "teacher not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to deactivate"})
	}

	return c.JSON(fiber.Map{"message": "teacher deactivated"})
}
