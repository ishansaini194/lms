package handlers

import (
	"errors"
	"strconv"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/ishansaini194/lms/api/internal/middleware"
	"github.com/ishansaini194/lms/api/internal/models"
	"gorm.io/gorm"
)

type ClassHandler struct {
	DB *gorm.DB
}

func NewClassHandler(db *gorm.DB) *ClassHandler {
	return &ClassHandler{
		DB: db,
	}
}

type ClassRequest struct {
	Name    string `json:"name"`
	Section string `json:"section"`
	Board   string `json:"board"`
}

type ReorderRequest struct {
	Order []int `json:"order"`
}

func (h *ClassHandler) List(c *fiber.Ctx) error {
	schoolID := middleware.GetSchoolID(c)
	includeInactive, _ := strconv.ParseBool(c.Query("include_inactive"))

	classes := []models.Class{}
	query := h.DB.Where("school_id = ?", schoolID)
	if !includeInactive {
		query = query.Where("is_active = ?", true)
	}

	if err := query.Order("sort_order ASC, id ASC").Find(&classes).Error; err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to fetch classes")
	}

	return c.JSON(classes)
}

func (h *ClassHandler) GetOne(c *fiber.Ctx) error {
	schoolID := middleware.GetSchoolID(c)

	id, err := strconv.Atoi(c.Params("id"))
	if err != nil || id <= 0 {
		return fiber.NewError(fiber.StatusBadRequest, "Invalid class ID")
	}

	var class models.Class
	if err := h.DB.Where("school_id = ? AND id = ?", schoolID, id).
		First(&class).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return fiber.NewError(fiber.StatusNotFound, "Class not found")
		}
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to fetch class")
	}

	return c.JSON(class)
}

func (h *ClassHandler) Create(c *fiber.Ctx) error {
	schoolID := middleware.GetSchoolID(c)

	var req ClassRequest
	if err := c.BodyParser(&req); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Invalid request body")
	}

	// Validate name
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		return fiber.NewError(fiber.StatusBadRequest, "name is required")
	}

	// Section: empty allowed (Option B from earlier)
	req.Section = strings.TrimSpace(req.Section)

	// Normalize board: lowercase + trim. Empty allowed.
	board := strings.ToLower(strings.TrimSpace(req.Board))
	var boardPtr *string
	if board != "" {
		boardPtr = &board
	}

	var class models.Class

	err := h.DB.Transaction(func(tx *gorm.DB) error {
		// Calculate next sort_order: MAX existing + 10
		var maxOrder int
		if err := tx.Model(&models.Class{}).
			Where("school_id = ?", schoolID).
			Select("COALESCE(MAX(sort_order), 0)").
			Scan(&maxOrder).Error; err != nil {
			return err
		}

		class = models.Class{
			SchoolID:  schoolID,
			Name:      req.Name,
			Section:   req.Section,
			Board:     boardPtr,
			SortOrder: maxOrder + 10,
			IsActive:  true,
		}
		return tx.Create(&class).Error
	})

	if err != nil {
		if isUniqueViolation(err) {
			return fiber.NewError(fiber.StatusConflict, "Class with this name and section already exists")
		}
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to create class")
	}

	return c.Status(fiber.StatusCreated).JSON(class)
}

func (h *ClassHandler) Update(c *fiber.Ctx) error {
	schoolID := middleware.GetSchoolID(c)

	id, err := strconv.Atoi(c.Params("id"))
	if err != nil || id <= 0 {
		return fiber.NewError(fiber.StatusBadRequest, "Invalid class ID")
	}

	var req ClassRequest
	if err := c.BodyParser(&req); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Invalid request body")
	}

	// Validate and normalize (same as Create)
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		return fiber.NewError(fiber.StatusBadRequest, "name is required")
	}
	req.Section = strings.TrimSpace(req.Section)

	board := strings.ToLower(strings.TrimSpace(req.Board))
	var boardPtr *string
	if board != "" {
		boardPtr = &board
	}

	// Fetch existing row to confirm it exists and belongs to this school
	var class models.Class
	if err := h.DB.Where("school_id = ? AND id = ?", schoolID, id).
		First(&class).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return fiber.NewError(fiber.StatusNotFound, "Class not found")
		}
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to fetch class")
	}

	// Apply changes — sort_order and is_active intentionally not touched here
	class.Name = req.Name
	class.Section = req.Section
	class.Board = boardPtr

	if err := h.DB.Save(&class).Error; err != nil {
		if isUniqueViolation(err) {
			return fiber.NewError(fiber.StatusConflict, "Class with this name and section already exists")
		}
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to update class")
	}

	return c.Status(fiber.StatusOK).JSON(class)
}
