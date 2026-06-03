package handlers

import (
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/ishansaini194/lms/api/internal/middleware"
	"github.com/ishansaini194/lms/api/internal/models"
	"github.com/ishansaini194/lms/api/internal/services"
	"gorm.io/gorm"
)

type SchoolHandler struct {
	DB *gorm.DB
}

func NewSchoolHandler(db *gorm.DB) *SchoolHandler {
	return &SchoolHandler{DB: db}
}

// schoolProfile serializes the full editable profile (same shape for GET + PUT).
func schoolProfile(s models.School) fiber.Map {
	return fiber.Map{
		"id":                   s.ID,
		"name":                 s.Name,
		"code":                 s.Code,
		"address":              s.Address,
		"phone":                s.Phone,
		"email":                s.Email,
		"logo_url":             s.LogoURL,
		"receipt_format":       s.ReceiptFormat,
		"receipt_reset":        s.ReceiptReset,
		"receipt_starting_num": s.ReceiptStartingNum,
		"sms_enabled":          s.SmsEnabled,
		"created_at":           s.CreatedAt,
		"updated_at":           s.UpdatedAt,
	}
}

// ListPublic — GET /api/schools. Public, unauthenticated endpoint used by the
// login page to populate the school dropdown. Returns ONLY id/code/name, never
// any sensitive column (address, phone, email, logo, receipt config, …).
func (h *SchoolHandler) ListPublic(c *fiber.Ctx) error {
	type publicSchool struct {
		ID   uint   `json:"id"`
		Code string `json:"code"`
		Name string `json:"name"`
	}

	var schools []publicSchool
	if err := h.DB.Model(&models.School{}).
		Select("id", "code", "name").
		Order("name ASC").
		Find(&schools).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to load schools"})
	}

	return c.JSON(schools)
}

var validReceiptReset = map[string]bool{"yearly": true, "monthly": true, "never": true}

// GET /api/school — the current school's full profile.
func (h *SchoolHandler) Get(c *fiber.Ctx) error {
	schoolID := middleware.GetSchoolID(c)

	var school models.School
	if err := h.DB.First(&school, schoolID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "school not found"})
	}

	return c.JSON(schoolProfile(school))
}

// UpdateSchoolRequest — partial update of editable fields. code is immutable.
type UpdateSchoolRequest struct {
	Name               *string `json:"name,omitempty"`
	Address            *string `json:"address,omitempty"`
	Phone              *string `json:"phone,omitempty"`
	Email              *string `json:"email,omitempty"`
	LogoURL            *string `json:"logo_url,omitempty"`
	ReceiptFormat      *string `json:"receipt_format,omitempty"`
	ReceiptReset       *string `json:"receipt_reset,omitempty"`
	ReceiptStartingNum *int    `json:"receipt_starting_num,omitempty"`
	SmsEnabled         *bool   `json:"sms_enabled,omitempty"`
}

// PUT /api/school — update the current school (admin-only). code is immutable.
func (h *SchoolHandler) Update(c *fiber.Ctx) error {
	schoolID := middleware.GetSchoolID(c)

	var body UpdateSchoolRequest
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request"})
	}

	updates := map[string]interface{}{}
	if body.Name != nil {
		n := strings.TrimSpace(*body.Name)
		if n == "" {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "name cannot be empty"})
		}
		updates["name"] = n
	}
	if body.Address != nil {
		updates["address"] = strings.TrimSpace(*body.Address)
	}
	if body.Phone != nil {
		updates["phone"] = strings.TrimSpace(*body.Phone)
	}
	if body.Email != nil {
		updates["email"] = strings.TrimSpace(*body.Email)
	}
	if body.LogoURL != nil {
		updates["logo_url"] = strings.TrimSpace(*body.LogoURL)
	}
	if body.ReceiptFormat != nil {
		updates["receipt_format"] = strings.TrimSpace(*body.ReceiptFormat)
	}
	if body.ReceiptReset != nil {
		r := strings.TrimSpace(*body.ReceiptReset)
		if !validReceiptReset[r] {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "receipt_reset must be yearly, monthly, or never"})
		}
		updates["receipt_reset"] = r
	}
	if body.ReceiptStartingNum != nil {
		if *body.ReceiptStartingNum < 0 {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "receipt_starting_num cannot be negative"})
		}
		updates["receipt_starting_num"] = *body.ReceiptStartingNum
	}
	if body.SmsEnabled != nil {
		updates["sms_enabled"] = *body.SmsEnabled
	}

	var school models.School
	err := h.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.First(&school, schoolID).Error; err != nil {
			return err
		}

		before := map[string]interface{}{}
		for k := range updates {
			// snapshot the prior value of each changed field for the audit log
			switch k {
			case "name":
				before[k] = school.Name
			case "address":
				before[k] = school.Address
			case "phone":
				before[k] = school.Phone
			case "email":
				before[k] = school.Email
			case "logo_url":
				before[k] = school.LogoURL
			case "receipt_format":
				before[k] = school.ReceiptFormat
			case "receipt_reset":
				before[k] = school.ReceiptReset
			case "receipt_starting_num":
				before[k] = school.ReceiptStartingNum
			case "sms_enabled":
				before[k] = school.SmsEnabled
			}
		}

		if len(updates) > 0 {
			if err := tx.Model(&school).Updates(updates).Error; err != nil {
				return err
			}
			ev := auditCtx(c)
			ev.Action = "update"
			ev.EntityType = "school"
			ev.EntityID = school.ID
			ev.Before = before
			ev.After = updates
			if err := services.Log(tx, ev); err != nil {
				return err
			}
		}
		return nil
	})

	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to update school"})
	}

	// Reload fresh state.
	if err := h.DB.First(&school, schoolID).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "update succeeded but reload failed"})
	}
	return c.JSON(schoolProfile(school))
}
