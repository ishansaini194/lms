package handlers

import (
	"errors"
	"strconv"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/ishansaini194/lms/api/internal/middleware"
	"github.com/ishansaini194/lms/api/internal/models"
	"gorm.io/gorm"
)

type AcademicYearHandler struct {
	DB *gorm.DB
}

func NewAcademicYearHandler(db *gorm.DB) *AcademicYearHandler {
	return &AcademicYearHandler{DB: db}
}

type AcademicYearRequest struct {
	YearLabel string    `json:"year_label"`
	StartDate time.Time `json:"start_date"`
	EndDate   time.Time `json:"end_date"`
	IsCurrent bool      `json:"is_current"`
}

func (h *AcademicYearHandler) List(c *fiber.Ctx) error {
	schoolID := middleware.GetSchoolID(c)
	academicYears := []models.AcademicYear{}
	if err := h.DB.Where("school_id = ?", schoolID).
		Order("start_date DESC").
		Find(&academicYears).Error; err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to fetch academic years")
	}
	return c.JSON(academicYears)
}

func (h *AcademicYearHandler) GetOne(c *fiber.Ctx) error {
	schoolID := middleware.GetSchoolID(c)

	id, err := strconv.Atoi(c.Params("id"))
	if err != nil || id <= 0 {
		return fiber.NewError(fiber.StatusBadRequest, "Invalid academic year ID")
	}

	var academicYear models.AcademicYear
	if err := h.DB.Where("school_id = ? AND id = ?", schoolID, id).
		First(&academicYear).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return fiber.NewError(fiber.StatusNotFound, "Academic year not found")
		}
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to fetch academic year")
	}

	return c.JSON(academicYear)
}

func (h *AcademicYearHandler) Create(c *fiber.Ctx) error {
	schoolID := middleware.GetSchoolID(c)

	var req AcademicYearRequest
	if err := c.BodyParser(&req); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Invalid request body")
	}

	if req.YearLabel == "" {
		return fiber.NewError(fiber.StatusBadRequest, "year_label is required")
	}
	if !req.EndDate.After(req.StartDate) {
		return fiber.NewError(fiber.StatusBadRequest, "end_date must be after start_date")
	}

	var academicYear models.AcademicYear

	err := h.DB.Transaction(func(tx *gorm.DB) error {
		if req.IsCurrent {
			if err := tx.Model(&models.AcademicYear{}).
				Where("school_id = ? AND is_current = ?", schoolID, true).
				Update("is_current", false).Error; err != nil {
				return err
			}
		}

		academicYear = models.AcademicYear{
			SchoolID:  schoolID,
			YearLabel: req.YearLabel,
			StartDate: req.StartDate,
			EndDate:   req.EndDate,
			IsCurrent: req.IsCurrent,
		}
		return tx.Create(&academicYear).Error
	})

	if err != nil {
		if isUniqueViolation(err) {
			return fiber.NewError(fiber.StatusConflict, "Academic year already exists")
		}
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to create academic year")
	}

	return c.Status(fiber.StatusCreated).JSON(academicYear)
}

func (h *AcademicYearHandler) Update(c *fiber.Ctx) error {
	schoolID := middleware.GetSchoolID(c)

	id, err := strconv.Atoi(c.Params("id"))
	if err != nil || id <= 0 {
		return fiber.NewError(fiber.StatusBadRequest, "Invalid academic year ID")
	}

	var req AcademicYearRequest
	if err := c.BodyParser(&req); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Invalid request body")
	}

	if req.YearLabel == "" {
		return fiber.NewError(fiber.StatusBadRequest, "year_label is required")
	}
	if !req.EndDate.After(req.StartDate) {
		return fiber.NewError(fiber.StatusBadRequest, "end_date must be after start_date")
	}

	// Fetch the existing row to confirm it exists and belongs to this school
	var academicYear models.AcademicYear
	if err := h.DB.Where("school_id = ? AND id = ?", schoolID, id).
		First(&academicYear).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return fiber.NewError(fiber.StatusNotFound, "Academic year not found")
		}
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to fetch academic year")
	}

	// Update in a transaction
	err = h.DB.Transaction(func(tx *gorm.DB) error {
		if req.IsCurrent {
			// Unset is_current on all other rows for this school
			if err := tx.Model(&models.AcademicYear{}).
				Where("school_id = ? AND id != ? AND is_current = ?", schoolID, id, true).
				Update("is_current", false).Error; err != nil {
				return err
			}
		}

		// Apply changes to the fetched row
		academicYear.YearLabel = req.YearLabel
		academicYear.StartDate = req.StartDate
		academicYear.EndDate = req.EndDate
		academicYear.IsCurrent = req.IsCurrent

		return tx.Save(&academicYear).Error
	})

	if err != nil {
		if isUniqueViolation(err) {
			return fiber.NewError(fiber.StatusConflict, "Academic year already exists")
		}
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to update academic year")
	}

	return c.Status(fiber.StatusOK).JSON(academicYear)
}
