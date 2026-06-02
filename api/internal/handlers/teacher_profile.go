package handlers

import (
	"errors"

	"github.com/gofiber/fiber/v2"
	"github.com/ishansaini194/lms/api/internal/middleware"
	"github.com/ishansaini194/lms/api/internal/models"
	"gorm.io/gorm"
)

type TeacherProfileHandler struct {
	DB *gorm.DB
}

func NewTeacherProfileHandler(db *gorm.DB) *TeacherProfileHandler {
	return &TeacherProfileHandler{DB: db}
}

// GET /api/teacher/profile — the teacher's own record (read-only).
func (h *TeacherProfileHandler) Profile(c *fiber.Ctx) error {
	teacherID := middleware.GetTeacherID(c)
	if teacherID == 0 {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "not a teacher account"})
	}
	schoolID := middleware.GetSchoolID(c)

	var teacher models.Teacher
	if err := h.DB.Where("id = ? AND school_id = ?", teacherID, schoolID).First(&teacher).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "teacher not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "database error"})
	}
	return c.JSON(teacher)
}
