package handlers

import (
	"errors"
	"strconv"

	"github.com/gofiber/fiber/v2"
	"github.com/ishansaini194/lms/api/internal/middleware"
	"github.com/ishansaini194/lms/api/internal/models"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"
)

type ClassYearHandler struct {
	DB *gorm.DB
}

func NewClassYearHandler(db *gorm.DB) *ClassYearHandler {
	return &ClassYearHandler{DB: db}
}

// UpdateClassYearRequest — mutable fields only.
// ClassTeacherID: omit to leave unchanged, send 0 to clear, send a uint to set.
// Request for Create — all fields required (well, ClassTeacherID optional)
type CreateClassYearRequest struct {
	ClassID        uint   `json:"class_id"`
	AcademicYearID uint   `json:"academic_year_id"`
	ClassTeacherID *uint  `json:"class_teacher_id"` // optional
	TuitionFee     string `json:"tuition_fee"`      // decimal as string e.g. "800.00"
	TransportFee   string `json:"transport_fee"`
}

// Request for Update — only mutable fields allowed.
// class_id and academic_year_id are immutable (they define the row's identity).
type UpdateClassYearRequest struct {
	ClassTeacherID *uint   `json:"class_teacher_id,omitempty"`
	TuitionFee     *string `json:"tuition_fee,omitempty"`
	TransportFee   *string `json:"transport_fee,omitempty"`
}

// GET /api/class-years
// Query params: academic_year_id, class_id, include_inactive
func (h *ClassYearHandler) List(c *fiber.Ctx) error {
	schoolID := middleware.GetSchoolID(c)

	academicYearID := c.QueryInt("academic_year_id", 0)
	classID := c.QueryInt("class_id", 0)
	includeInactive, _ := strconv.ParseBool(c.Query("include_inactive"))

	query := h.DB.Where("school_id = ?", schoolID)

	if !includeInactive {
		query = query.Where("is_active = ?", true)
	}
	if academicYearID > 0 {
		query = query.Where("academic_year_id = ?", academicYearID)
	}
	if classID > 0 {
		query = query.Where("class_id = ?", classID)
	}
	if isTeacher(c) {
		query = query.Where("class_teacher_id = ?", middleware.GetTeacherID(c))
	}

	classYears := []models.ClassYear{}
	if err := query.
		Preload("Class").
		Preload("AcademicYear").
		Preload("ClassTeacher").
		Find(&classYears).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to fetch class years"})
	}

	return c.JSON(classYears)
}

// GET /api/class-years/:id
func (h *ClassYearHandler) GetOne(c *fiber.Ctx) error {
	schoolID := middleware.GetSchoolID(c)

	id, err := strconv.Atoi(c.Params("id"))
	if err != nil || id <= 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid class year id"})
	}

	var classYear models.ClassYear
	if err := h.DB.
		Where("id = ? AND school_id = ?", id, schoolID).
		Preload("Class").
		Preload("AcademicYear").
		Preload("ClassTeacher").
		First(&classYear).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "class year not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "database error"})
	}
	if isTeacher(c) {
		if classYear.ClassTeacherID == nil || *classYear.ClassTeacherID != middleware.GetTeacherID(c) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "class year not found"})
		}
	}

	return c.JSON(classYear)
}

// POST /api/class-years
func (h *ClassYearHandler) Create(c *fiber.Ctx) error {
	schoolID := middleware.GetSchoolID(c)

	var body CreateClassYearRequest
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request"})
	}

	// Required field checks
	if body.ClassID == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "class_id is required"})
	}
	if body.AcademicYearID == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "academic_year_id is required"})
	}

	// Parse fees from string -> decimal
	tuition, err := decimal.NewFromString(body.TuitionFee)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid tuition_fee"})
	}
	transport, err := decimal.NewFromString(body.TransportFee)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid transport_fee"})
	}

	if tuition.IsNegative() {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "tuition_fee cannot be negative"})
	}
	if transport.IsNegative() {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "transport_fee cannot be negative"})
	}

	// Cross-tenancy validation — verify referenced rows belong to this school
	// This prevents school A's admin from referencing school B's class/teacher/year
	if err := h.validateClassBelongsToSchool(body.ClassID, schoolID); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "class not found in this school"})
	}
	if err := h.validateAcademicYearBelongsToSchool(body.AcademicYearID, schoolID); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "academic year not found in this school"})
	}
	if body.ClassTeacherID != nil {
		if err := h.validateTeacherBelongsToSchool(*body.ClassTeacherID, schoolID); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "teacher not found in this school"})
		}
	}

	classYear := models.ClassYear{
		SchoolID:       schoolID,
		ClassID:        body.ClassID,
		AcademicYearID: body.AcademicYearID,
		ClassTeacherID: body.ClassTeacherID,
		TuitionFee:     tuition,
		TransportFee:   transport,
		IsActive:       true,
	}

	if err := h.DB.Create(&classYear).Error; err != nil {
		if isUniqueViolation(err) {
			return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "class year for this class and academic year already exists"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to create class year"})
	}

	// Reload with preloads so frontend gets the full picture
	if err := h.DB.
		Where("school_id = ?", schoolID).
		Preload("Class").
		Preload("AcademicYear").
		Preload("ClassTeacher").
		First(&classYear, classYear.ID).Error; err != nil {
		// Created but failed to reload — return what we have
		return c.Status(fiber.StatusCreated).JSON(classYear)
	}

	return c.Status(fiber.StatusCreated).JSON(classYear)
}

// PUT /api/class-years/:id
func (h *ClassYearHandler) Update(c *fiber.Ctx) error {
	schoolID := middleware.GetSchoolID(c)

	id, err := strconv.Atoi(c.Params("id"))
	if err != nil || id <= 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid class year id"})
	}

	var classYear models.ClassYear
	if err := h.DB.Where("id = ? AND school_id = ?", id, schoolID).First(&classYear).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "class year not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "database error"})
	}

	var body UpdateClassYearRequest
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request"})
	}

	updates := map[string]interface{}{}

	if body.TuitionFee != nil {
		tuition, err := decimal.NewFromString(*body.TuitionFee)
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid tuition_fee"})
		}
		if tuition.IsNegative() {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "tuition_fee cannot be negative"})
		}
		updates["tuition_fee"] = tuition
	}

	if body.TransportFee != nil {
		transport, err := decimal.NewFromString(*body.TransportFee)
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid transport_fee"})
		}
		if transport.IsNegative() {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "transport_fee cannot be negative"})
		}
		updates["transport_fee"] = transport
	}

	if body.ClassTeacherID != nil {
		// Special handling: client can explicitly set teacher to null by sending 0
		// or omit the field entirely to leave it unchanged
		if *body.ClassTeacherID == 0 {
			updates["class_teacher_id"] = nil
		} else {
			if err := h.validateTeacherBelongsToSchool(*body.ClassTeacherID, schoolID); err != nil {
				return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "teacher not found in this school"})
			}
			updates["class_teacher_id"] = *body.ClassTeacherID
		}
	}

	if len(updates) == 0 {
		return c.JSON(classYear)
	}

	if err := h.DB.Model(&classYear).Updates(updates).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "update failed"})
	}

	// Reload with preloads
	if err := h.DB.
		Where("school_id = ?", schoolID).
		Preload("Class").
		Preload("AcademicYear").
		Preload("ClassTeacher").
		First(&classYear, classYear.ID).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "update succeeded but reload failed"})
	}

	return c.JSON(classYear)
}

// DELETE /api/class-years/:id
// Soft delete via is_active = false. Blocks if active enrollments exist.
func (h *ClassYearHandler) Delete(c *fiber.Ctx) error {
	schoolID := middleware.GetSchoolID(c)

	id, err := strconv.Atoi(c.Params("id"))
	if err != nil || id <= 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid class year id"})
	}

	// Confirm the class_year exists and belongs to this school
	var classYear models.ClassYear
	if err := h.DB.Where("id = ? AND school_id = ?", id, schoolID).First(&classYear).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "class year not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "database error"})
	}

	// Check for active enrollments — block deactivation if any exist
	var activeEnrollments int64
	if err := h.DB.Model(&models.Enrollment{}).
		Where("class_year_id = ? AND status = ?", id, "active").
		Count(&activeEnrollments).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to check enrollments"})
	}

	if activeEnrollments > 0 {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{
			"error": "class year has active students. Move them out first.",
		})
	}

	if err := h.DB.Model(&classYear).Update("is_active", false).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to deactivate"})
	}

	return c.JSON(fiber.Map{"message": "class year deactivated"})
}

// --- Cross-tenancy validation helpers ---
// These verify that a referenced row belongs to the specified school.
// Used during Create/Update to prevent cross-school FK manipulation.

func (h *ClassYearHandler) validateAcademicYearBelongsToSchool(yearID, schoolID uint) error {
	var count int64
	if err := h.DB.Model(&models.AcademicYear{}).
		Where("id = ? AND school_id = ?", yearID, schoolID).
		Count(&count).Error; err != nil {
		return err
	}
	if count == 0 {
		return errors.New("academic year not found in school")
	}
	return nil
}

func (h *ClassYearHandler) validateClassBelongsToSchool(classID, schoolID uint) error {
	var count int64
	if err := h.DB.Model(&models.Class{}).
		Where("id = ? AND school_id = ? AND is_active = ?", classID, schoolID, true).
		Count(&count).Error; err != nil {
		return err
	}
	if count == 0 {
		return errors.New("class not found or inactive")
	}
	return nil
}

func (h *ClassYearHandler) validateTeacherBelongsToSchool(teacherID, schoolID uint) error {
	var count int64
	if err := h.DB.Model(&models.Teacher{}).
		Where("id = ? AND school_id = ? AND is_active = ?", teacherID, schoolID, true).
		Count(&count).Error; err != nil {
		return err
	}
	if count == 0 {
		return errors.New("teacher not found or inactive")
	}
	return nil
}
