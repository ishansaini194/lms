package handlers

import (
	"errors"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/ishansaini194/lms/api/internal/middleware"
	"github.com/ishansaini194/lms/api/internal/models"
	"github.com/ishansaini194/lms/api/internal/services"
	"gorm.io/gorm"
)

type EnrollmentsHandler struct {
	DB *gorm.DB
}

func NewEnrollmentsHandler(db *gorm.DB) *EnrollmentsHandler {
	return &EnrollmentsHandler{DB: db}
}

// Request for Update — only used to transition active -> left/graduated.
// Promotion happens via the bulk promote endpoint, not here.
type UpdateEnrollmentRequest struct {
	Status     string     `json:"status"`                // must be "left" or "graduated"
	LeftOn     *time.Time `json:"left_on"`               // required
	LeftReason *string    `json:"left_reason,omitempty"` // required if status=left
}

// Request for bulk promotion.
type PromoteRequest struct {
	FromClassYearID uint `json:"from_class_year_id"`
	ToClassYearID   uint `json:"to_class_year_id"`
}

// GET /api/enrollments
// Filters: class_year_id, student_id, status. Paginated 20/page (max 100).
func (h *EnrollmentsHandler) List(c *fiber.Ctx) error {
	schoolID := middleware.GetSchoolID(c)

	classYearID := c.QueryInt("class_year_id", 0)
	studentID := c.QueryInt("student_id", 0)
	status := c.Query("status")
	page := c.QueryInt("page", 1)
	limit := c.QueryInt("limit", 20)

	if limit > 100 {
		limit = 100
	}
	if limit < 1 {
		limit = 20
	}
	if page < 1 {
		page = 1
	}

	query := h.DB.Model(&models.Enrollment{}).Where("school_id = ?", schoolID)

	if classYearID > 0 {
		query = query.Where("class_year_id = ?", classYearID)
	}
	if studentID > 0 {
		query = query.Where("student_id = ?", studentID)
	}
	if status != "" {
		query = query.Where("status = ?", status)
	}
	if isTeacher(c) {
		// Scope to the union of her class-teacher classes and subject-teaching
		// assignments. Single IN over a Go-resolved set — see teacherClassYearIDs
		// for why we don't inline an OR here. Empty set → IN (NULL) → no rows.
		cyIDs := teacherClassYearIDs(h.DB, middleware.GetTeacherID(c), schoolID)
		query = query.Where("class_year_id IN ?", cyIDs)
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to count enrollments"})
	}

	var enrollments []models.Enrollment
	offset := (page - 1) * limit
	if err := query.
		Preload("Student").
		Preload("ClassYear.Class").
		Preload("ClassYear.AcademicYear").
		Order("created_at desc").
		Limit(limit).
		Offset(offset).
		Find(&enrollments).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to fetch enrollments"})
	}

	totalPages := int(total) / limit
	if int(total)%limit > 0 {
		totalPages++
	}

	return c.JSON(fiber.Map{
		"data":        enrollments,
		"total":       total,
		"page":        page,
		"limit":       limit,
		"total_pages": totalPages,
	})
}

// GET /api/enrollments/:id
func (h *EnrollmentsHandler) GetOne(c *fiber.Ctx) error {
	schoolID := middleware.GetSchoolID(c)

	id, err := strconv.Atoi(c.Params("id"))
	if err != nil || id <= 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid enrollment id"})
	}

	var enrollment models.Enrollment
	if err := h.DB.
		Where("id = ? AND school_id = ?", id, schoolID).
		Preload("Student").
		Preload("ClassYear.Class").
		Preload("ClassYear.AcademicYear").
		First(&enrollment).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "enrollment not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "database error"})
	}
	if isTeacher(c) {
		if !teacherCanSeeClassYear(h.DB, middleware.GetTeacherID(c), enrollment.ClassYearID, schoolID) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "enrollment not found"})
		}
	}

	return c.JSON(enrollment)
}

// PUT /api/enrollments/:id
// Only allows active -> left or active -> graduated.
// Promotion goes through the bulk promote endpoint.
func (h *EnrollmentsHandler) Update(c *fiber.Ctx) error {
	schoolID := middleware.GetSchoolID(c)

	id, err := strconv.Atoi(c.Params("id"))
	if err != nil || id <= 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid enrollment id"})
	}

	var enrollment models.Enrollment
	if err := h.DB.Where("id = ? AND school_id = ?", id, schoolID).First(&enrollment).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "enrollment not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "database error"})
	}

	// Only allow transitions from "active"
	if enrollment.Status != "active" {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{
			"error": "only active enrollments can be updated; current status: " + enrollment.Status,
		})
	}

	var body UpdateEnrollmentRequest
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request"})
	}

	// Normalize: lowercase + trim so "Left", "LEFT", " left " all work
	body.Status = strings.ToLower(strings.TrimSpace(body.Status))

	// Only "left" and "graduated" are valid targets via manual update
	if body.Status != "left" && body.Status != "graduated" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "status must be 'left' or 'graduated'",
		})
	}

	if body.LeftOn == nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "left_on is required"})
	}

	// left_reason is required for "left", optional for "graduated"
	if body.Status == "left" {
		if body.LeftReason == nil || strings.TrimSpace(*body.LeftReason) == "" {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "left_reason is required when status is 'left'"})
		}
	}

	beforeStatus := enrollment.Status

	updates := map[string]interface{}{
		"status":  body.Status,
		"left_on": body.LeftOn,
	}

	if body.Status == "left" && body.LeftReason != nil {
		updates["left_reason"] = strings.TrimSpace(*body.LeftReason)
	} else {
		updates["left_reason"] = nil
	}

	if err := h.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&enrollment).Updates(updates).Error; err != nil {
			return err
		}
		ev := auditCtx(c)
		ev.Action = "status_change"
		ev.EntityType = "enrollment"
		ev.EntityID = enrollment.ID
		ev.Before = map[string]interface{}{"status": beforeStatus}
		ev.After = map[string]interface{}{"status": body.Status, "left_on": body.LeftOn}
		return services.Log(tx, ev)
	}); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "update failed"})
	}

	// Reload with preloads
	if err := h.DB.
		Where("school_id = ?", schoolID).
		Preload("Student").
		Preload("ClassYear.Class").
		Preload("ClassYear.AcademicYear").
		First(&enrollment, enrollment.ID).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "update succeeded but reload failed"})
	}

	return c.JSON(enrollment)
}

// POST /api/enrollments/promote
// Bulk-promotes all active students from one class_year to another.
// All-or-nothing — single transaction.
func (h *EnrollmentsHandler) Promote(c *fiber.Ctx) error {
	schoolID := middleware.GetSchoolID(c)

	var body PromoteRequest
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request"})
	}

	if body.FromClassYearID == 0 || body.ToClassYearID == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "from_class_year_id and to_class_year_id are required",
		})
	}
	if body.FromClassYearID == body.ToClassYearID {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "from_class_year_id and to_class_year_id must differ",
		})
	}

	// Verify both class_years exist, belong to this school, and are active
	if err := h.validateClassYearBelongsToSchool(body.FromClassYearID, schoolID); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "from_class_year_id not found or inactive"})
	}
	if err := h.validateClassYearBelongsToSchool(body.ToClassYearID, schoolID); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "to_class_year_id not found or inactive"})
	}

	var promotedCount int
	var skippedCount int

	err := h.DB.Transaction(func(tx *gorm.DB) error {
		// Get all active enrollments in source class_year
		var sourceEnrollments []models.Enrollment
		if err := tx.Where("school_id = ? AND class_year_id = ? AND status = ?",
			schoolID, body.FromClassYearID, "active").
			Find(&sourceEnrollments).Error; err != nil {
			return err
		}

		// One query: pluck all student IDs already enrolled in target class_year.
		// Bulk-fetch avoids N+1 — was 1 COUNT per student before.
		var existingStudentIDs []uint
		if err := tx.Model(&models.Enrollment{}).
			Where("school_id = ? AND class_year_id = ?", schoolID, body.ToClassYearID).
			Pluck("student_id", &existingStudentIDs).Error; err != nil {
			return err
		}

		// Build a set for O(1) lookup during the loop
		existingSet := make(map[uint]bool, len(existingStudentIDs))
		for _, sid := range existingStudentIDs {
			existingSet[sid] = true
		}

		for _, sourceEnr := range sourceEnrollments {
			// Idempotency: skip if student already enrolled in target
			if existingSet[sourceEnr.StudentID] {
				skippedCount++
				continue
			}

			// Step 1: mark source enrollment as promoted
			if err := tx.Model(&sourceEnr).Update("status", "promoted").Error; err != nil {
				return err
			}

			// Step 2: create new active enrollment in target class_year
			newEnr := models.Enrollment{
				SchoolID:    schoolID,
				StudentID:   sourceEnr.StudentID,
				ClassYearID: body.ToClassYearID,
				Status:      "active",
			}
			if err := tx.Create(&newEnr).Error; err != nil {
				return err
			}

			promotedCount++
		}

		ev := auditCtx(c)
		ev.Action = "promote"
		ev.EntityType = "enrollment"
		ev.EntityID = body.FromClassYearID // the source class_year as the subject
		ev.After = map[string]interface{}{
			"from_class_year": body.FromClassYearID,
			"to_class_year":   body.ToClassYearID,
			"promoted_count":  promotedCount,
			"skipped_count":   skippedCount,
		}
		return services.Log(tx, ev)
	})

	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "promotion failed"})
	}

	return c.JSON(fiber.Map{
		"message":         "promotion complete",
		"promoted_count":  promotedCount,
		"skipped_count":   skippedCount,
		"from_class_year": body.FromClassYearID,
		"to_class_year":   body.ToClassYearID,
	})
}

// --- Helpers ---

func (h *EnrollmentsHandler) validateClassYearBelongsToSchool(classYearID, schoolID uint) error {
	var count int64
	if err := h.DB.Model(&models.ClassYear{}).
		Where("id = ? AND school_id = ? AND is_active = ?", classYearID, schoolID, true).
		Count(&count).Error; err != nil {
		return err
	}
	if count == 0 {
		return errors.New("class year not found or inactive")
	}
	return nil
}
