package handlers

import (
	"errors"

	"github.com/gofiber/fiber/v2"
	"github.com/ishansaini194/lms/api/internal/auth"
	"github.com/ishansaini194/lms/api/internal/middleware"
	"github.com/ishansaini194/lms/api/internal/models"
	"gorm.io/gorm"
)

type TeachersHandler struct {
	*gorm.DB
}

func NewTeachersHandler(db *gorm.DB) *TeachersHandler {
	return &TeachersHandler{db}
}

// GET /api/teachers
func (h *TeachersHandler) ListTeachers(c *fiber.Ctx) error {
	schoolID := middleware.GetSchoolID(c)

	includeInactive := c.Query("include_inactive") == "true"

	query := h.DB.Where("school_id = ?", schoolID)
	if !includeInactive {
		query = query.Where("is_active = ?", true)
	}

	var teachers []models.Teacher
	if err := query.Order("name asc").Find(&teachers).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "error fetching teachers"})
	}
	return c.JSON(teachers)
}

// GET /api/teachers/:id
func (h *TeachersHandler) GetTeacher(c *fiber.Ctx) error {
	id := c.Params("id")
	schoolID := middleware.GetSchoolID(c)

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
		Password      string `json:"password"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request"})
	}

	if body.Name == "" || body.EmployeeID == "" || body.Username == "" || body.Password == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "name, employee_id, username and password are required"})
	}

	if len(body.Password) < 8 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "password must be at least 8 characters"})
	}

	hash, err := auth.HashPassword(body.Password)
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
		IsActive:     true,
	}

	err = h.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&teacher).Error; err != nil {
			return err
		}
		user.TeacherID = &teacher.ID
		if err := tx.Create(&user).Error; err != nil {
			return err
		}
		return nil
	})

	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to create teacher (username or employee_id may already exist)"})
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"message":    "teacher created",
		"teacher_id": teacher.ID,
		"user_id":    user.ID,
	})
}

// PUT /api/teachers/:id
func (h *TeachersHandler) UpdateTeacher(c *fiber.Ctx) error {
	id := c.Params("id")
	schoolID := middleware.GetSchoolID(c)

	var teacher models.Teacher
	if err := h.DB.Where("id = ? AND school_id = ?", id, schoolID).First(&teacher).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "teacher not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "database error"})
	}

	var body struct {
		Name          string `json:"name"`
		Phone         string `json:"phone"`
		Email         string `json:"email"`
		Subject       string `json:"subject"`
		Qualification string `json:"qualification"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request"})
	}

	if err := h.DB.Model(&teacher).Updates(body).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "update failed"})
	}

	return c.JSON(teacher)
}

// DELETE /api/teachers/:id
func (h *TeachersHandler) DeleteTeacher(c *fiber.Ctx) error {
	id := c.Params("id")
	schoolID := middleware.GetSchoolID(c)

	// Use a transaction so both updates happen together (or neither)
	err := h.DB.Transaction(func(tx *gorm.DB) error {
		// Step 1: Deactivate the teacher
		result := tx.Model(&models.Teacher{}).
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
			Where("teacher_id = ? AND school_id = ?", id, schoolID).
			Update("is_active", false).Error; err != nil {
			return err
		}

		return nil
	})

	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "teacher not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to deactivate"})
	}

	return c.JSON(fiber.Map{"message": "teacher deactivated"})
}
