package handlers

import (
	"github.com/gofiber/fiber/v2"
	"github.com/ishansaini194/lms/api/internal/middleware"
	"github.com/ishansaini194/lms/api/internal/models"
	"gorm.io/gorm"
)

type SchoolHandler struct {
	DB *gorm.DB
}

func NewSchoolHandler(db *gorm.DB) *SchoolHandler {
	return &SchoolHandler{DB: db}
}

// GET /api/school — the current school's profile (letterhead + receipt config).
// Read-only for now; Settings edit comes in a later phase.
func (h *SchoolHandler) Get(c *fiber.Ctx) error {
	schoolID := middleware.GetSchoolID(c)

	var school models.School
	if err := h.DB.First(&school, schoolID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "school not found"})
	}

	return c.JSON(fiber.Map{
		"id":             school.ID,
		"name":           school.Name,
		"code":           school.Code,
		"address":        school.Address,
		"phone":          school.Phone,
		"email":          school.Email,
		"logo_url":       school.LogoURL,
		"receipt_format": school.ReceiptFormat,
	})
}
