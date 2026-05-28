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

type ReorderItem struct {
	ID        uint `json:"id"`
	SortOrder int  `json:"sort_order"`
}
type ReorderRequest struct {
	Order []ReorderItem `json:"order"`
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
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch classes"})
	}

	return c.JSON(classes)
}

func (h *ClassHandler) GetOne(c *fiber.Ctx) error {
	schoolID := middleware.GetSchoolID(c)

	id, err := strconv.Atoi(c.Params("id"))
	if err != nil || id <= 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid class ID"})
	}

	var class models.Class
	if err := h.DB.Where("school_id = ? AND id = ?", schoolID, id).
		First(&class).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Class not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch class"})
	}

	return c.JSON(class)
}

func (h *ClassHandler) Create(c *fiber.Ctx) error {
	schoolID := middleware.GetSchoolID(c)

	var req ClassRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	// Validate name
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "name is required"})
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
			return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "Class with this name and section already exists"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create class"})
	}

	return c.Status(fiber.StatusCreated).JSON(class)
}

func (h *ClassHandler) Update(c *fiber.Ctx) error {
	schoolID := middleware.GetSchoolID(c)

	id, err := strconv.Atoi(c.Params("id"))
	if err != nil || id <= 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid class ID"})
	}

	var req ClassRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	// Validate and normalize (same as Create)
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "name is required"})
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
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Class not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch class"})
	}

	// Apply changes — sort_order and is_active intentionally not touched here
	class.Name = req.Name
	class.Section = req.Section
	class.Board = boardPtr

	if err := h.DB.Save(&class).Error; err != nil {
		if isUniqueViolation(err) {
			return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "Class with this name and section already exists"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to update class"})
	}

	return c.Status(fiber.StatusOK).JSON(class)
}

// DELETE /api/classes/:id
// Soft delete via is_active = false. Blocks if any class_years exist
// for this class (history preserves audit trail).
func (h *ClassHandler) Delete(c *fiber.Ctx) error {
	schoolID := middleware.GetSchoolID(c)

	id, err := strconv.Atoi(c.Params("id"))
	if err != nil || id <= 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid class id"})
	}

	// Confirm the class exists and belongs to this school
	var class models.Class
	if err := h.DB.Where("id = ? AND school_id = ?", id, schoolID).First(&class).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "class not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to fetch class"})
	}

	// Count class_years for this class (active OR inactive — any history blocks delete)
	var classYearCount int64
	if err := h.DB.Model(&models.ClassYear{}).
		Where("class_id = ? AND school_id = ?", id, schoolID).
		Count(&classYearCount).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to check class history"})
	}

	if classYearCount > 0 {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{
			"error": "class has history; cannot delete",
		})
	}

	if err := h.DB.Model(&class).Update("is_active", false).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to deactivate class"})
	}

	return c.JSON(fiber.Map{"message": "class deactivated"})
}

// Sentinel error for in-transaction signaling.
var errReorderMismatch = errors.New("reorder count mismatch")

// PATCH /api/classes/reorder
// Bulk-update sort_order for multiple classes in a single transaction.
// All-or-nothing — if any ID is missing, inactive, or cross-tenant, the
// entire reorder is rolled back.
func (h *ClassHandler) Reorder(c *fiber.Ctx) error {
	schoolID := middleware.GetSchoolID(c)

	var body ReorderRequest
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request"})
	}

	if len(body.Order) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "order cannot be empty"})
	}

	// In-memory validation: check for invalid IDs, negative sort_orders,
	// and duplicates in both id and sort_order.
	seenIDs := make(map[uint]bool, len(body.Order))
	seenSortOrders := make(map[int]bool, len(body.Order))

	for _, item := range body.Order {
		if item.ID == 0 {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid class id in order"})
		}
		if item.SortOrder < 0 {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "sort_order cannot be negative"})
		}
		if seenIDs[item.ID] {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "duplicate class id in order"})
		}
		if seenSortOrders[item.SortOrder] {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "duplicate sort_order in order"})
		}
		seenIDs[item.ID] = true
		seenSortOrders[item.SortOrder] = true
	}

	// Apply all updates in a single transaction.
	// If any update fails to match a row (wrong school, inactive, or missing),
	// the total RowsAffected won't match input length and we roll back.
	err := h.DB.Transaction(func(tx *gorm.DB) error {
		var totalAffected int64

		for _, item := range body.Order {
			res := tx.Model(&models.Class{}).
				Where("id = ? AND school_id = ? AND is_active = ?", item.ID, schoolID, true).
				Update("sort_order", item.SortOrder)
			if res.Error != nil {
				return res.Error
			}
			totalAffected += res.RowsAffected
		}

		if totalAffected != int64(len(body.Order)) {
			return errReorderMismatch
		}
		return nil
	})

	if err != nil {
		if errors.Is(err, errReorderMismatch) {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error": "some classes not found, inactive, or not in your school",
			})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "reorder failed"})
	}

	return c.JSON(fiber.Map{
		"message": "reorder complete",
		"updated": len(body.Order),
	})
}
