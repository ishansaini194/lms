package handlers

import (
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/ishansaini194/lms/api/internal/auth"
	"github.com/ishansaini194/lms/api/internal/middleware"
	"github.com/ishansaini194/lms/api/internal/models"
	"gorm.io/gorm"
)

type AuthHandler struct {
	DB *gorm.DB
}

func NewAuthHandler(db *gorm.DB) *AuthHandler {
	return &AuthHandler{DB: db}
}

// POST /api/login
func (h *AuthHandler) Login(c *fiber.Ctx) error {
	var body struct {
		SchoolCode string `json:"school_code"`
		Username   string `json:"username"`
		Password   string `json:"password"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request"})
	}

	if body.SchoolCode == "" || body.Username == "" || body.Password == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "missing fields"})
	}

	var school models.School
	if err := h.DB.Where("code = ?", body.SchoolCode).First(&school).Error; err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "invalid credentials"})
	}

	var user models.User
	if err := h.DB.Where("school_id = ? AND username = ? AND is_active = ?", school.ID, body.Username, true).First(&user).Error; err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "invalid credentials"})
	}

	if err := auth.CheckPassword(user.PasswordHash, body.Password); err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "invalid credentials"})
	}

	token, err := auth.GenerateToken(user)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to generate token"})
	}

	now := time.Now()
	h.DB.Model(&user).Update("last_login_at", now)

	return c.JSON(fiber.Map{
		"token": token,
		"user": fiber.Map{
			"id":           user.ID,
			"username":     user.Username,
			"role":         user.Role,
			"school_id":    user.SchoolID,
			"display_name": user.DisplayName,
		},
		"school": fiber.Map{
			"id":   school.ID,
			"name": school.Name,
			"code": school.Code,
		},
	})
}

// POST /api/auth/change-password
func (h *AuthHandler) ChangePassword(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	if userID == 0 {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}

	var body struct {
		OldPassword string `json:"old_password"`
		NewPassword string `json:"new_password"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request"})
	}

	if body.OldPassword == "" || body.NewPassword == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "missing fields"})
	}

	if len(body.NewPassword) < 8 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "password must be at least 8 characters"})
	}

	var user models.User
	if err := h.DB.First(&user, userID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "user not found"})
	}

	if err := auth.CheckPassword(user.PasswordHash, body.OldPassword); err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "incorrect current password"})
	}

	hash, err := auth.HashPassword(body.NewPassword)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to hash password"})
	}

	h.DB.Model(&user).Update("password_hash", hash)

	return c.JSON(fiber.Map{"message": "password changed"})
}

// POST /api/auth/reset-password/:id
func (h *AuthHandler) ResetPassword(c *fiber.Ctx) error {
	if middleware.GetRole(c) != "admin" {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "admin only"})
	}

	schoolID := middleware.GetSchoolID(c)
	targetID := c.Params("id")

	var body struct {
		NewPassword string `json:"new_password"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request"})
	}

	if len(body.NewPassword) < 8 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "password must be at least 8 characters"})
	}

	var user models.User
	if err := h.DB.Where("id = ? AND school_id = ?", targetID, schoolID).First(&user).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "user not found"})
	}

	hash, err := auth.HashPassword(body.NewPassword)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to hash password"})
	}

	h.DB.Model(&user).Update("password_hash", hash)

	return c.JSON(fiber.Map{"message": "password reset"})
}
