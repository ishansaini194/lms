package handlers

import (
	"errors"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/ishansaini194/lms/api/internal/middleware"
	"github.com/ishansaini194/lms/api/internal/models"
	"gorm.io/gorm"
)

type HomeworksHandler struct {
	DB *gorm.DB
}

func NewHomeworksHandler(db *gorm.DB) *HomeworksHandler {
	return &HomeworksHandler{DB: db}
}

type CreateHomeworkRequest struct {
	TeacherID    uint       `json:"teacher_id"`
	Subject      string     `json:"subject"`
	Content      string     `json:"content"`
	DueDate      *time.Time `json:"due_date,omitempty"`
	ClassYearIDs []uint     `json:"class_year_ids"`
}

type UpdateHomeworkRequest struct {
	Subject      *string    `json:"subject,omitempty"`
	Content      *string    `json:"content,omitempty"`
	DueDate      *time.Time `json:"due_date,omitempty"`
	ClassYearIDs *[]uint    `json:"class_year_ids,omitempty"` // nil = leave targets unchanged
}

type homeworkResponse struct {
	models.Homework
	ClassYearIDs []uint `json:"class_year_ids"`
}

// GET /api/homeworks?include_inactive=&class_year_id=&teacher_id=
func (h *HomeworksHandler) List(c *fiber.Ctx) error {
	schoolID := middleware.GetSchoolID(c)
	includeInactive, _ := strconv.ParseBool(c.Query("include_inactive"))
	classYearID := c.QueryInt("class_year_id", 0)
	teacherID := c.QueryInt("teacher_id", 0)

	query := h.DB.Model(&models.Homework{}).Where("homeworks.school_id = ?", schoolID)
	if !includeInactive {
		query = query.Where("homeworks.is_active = ?", true)
	}
	if teacherID > 0 {
		query = query.Where("homeworks.teacher_id = ?", teacherID)
	}
	if isTeacher(c) {
		query = query.Where("homeworks.teacher_id = ?", middleware.GetTeacherID(c))
	}
	if classYearID > 0 {
		query = query.
			Joins("JOIN homework_targets ON homework_targets.homework_id = homeworks.id").
			Where("homework_targets.class_year_id = ?", classYearID).
			Group("homeworks.id")
	}

	var homeworks []models.Homework
	if err := query.Order("homeworks.due_date DESC NULLS LAST, homeworks.id DESC").Find(&homeworks).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to fetch homeworks"})
	}

	return c.JSON(homeworks)
}

// GET /api/homeworks/:id  (includes target class_year IDs)
func (h *HomeworksHandler) GetOne(c *fiber.Ctx) error {
	schoolID := middleware.GetSchoolID(c)

	id, err := strconv.Atoi(c.Params("id"))
	if err != nil || id <= 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid homework id"})
	}

	var homework models.Homework
	if err := h.DB.Where("id = ? AND school_id = ?", id, schoolID).First(&homework).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "homework not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "database error"})
	}
	if isTeacher(c) {
		if homework.TeacherID != middleware.GetTeacherID(c) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "homework not found"})
		}
	}

	var ids []uint
	if err := h.DB.Model(&models.HomeworkTarget{}).
		Where("homework_id = ?", homework.ID).
		Pluck("class_year_id", &ids).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to fetch targets"})
	}

	return c.JSON(homeworkResponse{Homework: homework, ClassYearIDs: ids})
}

// POST /api/homeworks
func (h *HomeworksHandler) Create(c *fiber.Ctx) error {
	schoolID := middleware.GetSchoolID(c)

	var body CreateHomeworkRequest
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request"})
	}

	if isTeacher(c) {
		body.TeacherID = middleware.GetTeacherID(c)
	} else {
		if body.TeacherID == 0 {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "teacher_id is required"})
		}
		// Verify teacher belongs to this school
		var teacherCount int64
		if err := h.DB.Model(&models.Teacher{}).
			Where("id = ? AND school_id = ?", body.TeacherID, schoolID).
			Count(&teacherCount).Error; err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "database error"})
		}
		if teacherCount == 0 {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "teacher not found in this school"})
		}
	}
	body.Subject = strings.TrimSpace(body.Subject)
	body.Content = strings.TrimSpace(body.Content)
	if body.Subject == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "subject is required"})
	}
	if body.Content == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "content is required"})
	}
	if len(body.ClassYearIDs) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "at least one class_year_id is required"})
	}

	homework := models.Homework{
		SchoolID:  schoolID,
		TeacherID: body.TeacherID,
		Subject:   body.Subject,
		Content:   body.Content,
		DueDate:   body.DueDate,
		IsActive:  true,
	}

	err := h.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&homework).Error; err != nil {
			return err
		}
		return h.validateAndInsertTargets(tx, schoolID, homework.ID, body.ClassYearIDs)
	})

	if err != nil {
		var he *httpError
		if errors.As(err, &he) {
			return c.Status(he.status).JSON(fiber.Map{"error": he.msg})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to create homework"})
	}

	return c.Status(fiber.StatusCreated).JSON(homeworkResponse{Homework: homework, ClassYearIDs: body.ClassYearIDs})
}

// PUT /api/homeworks/:id
func (h *HomeworksHandler) Update(c *fiber.Ctx) error {
	schoolID := middleware.GetSchoolID(c)

	id, err := strconv.Atoi(c.Params("id"))
	if err != nil || id <= 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid homework id"})
	}

	var body UpdateHomeworkRequest
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request"})
	}

	err = h.DB.Transaction(func(tx *gorm.DB) error {
		var homework models.Homework
		if err := tx.Where("id = ? AND school_id = ?", id, schoolID).First(&homework).Error; err != nil {
			return err
		}
		if isTeacher(c) {
			if homework.TeacherID != middleware.GetTeacherID(c) {
				return &httpError{fiber.StatusNotFound, "homework not found"}
			}
		}

		updates := map[string]interface{}{}
		if body.Subject != nil {
			s := strings.TrimSpace(*body.Subject)
			if s == "" {
				return &httpError{fiber.StatusBadRequest, "subject cannot be empty"}
			}
			updates["subject"] = s
		}
		if body.Content != nil {
			ct := strings.TrimSpace(*body.Content)
			if ct == "" {
				return &httpError{fiber.StatusBadRequest, "content cannot be empty"}
			}
			updates["content"] = ct
		}
		if body.DueDate != nil {
			updates["due_date"] = *body.DueDate
		}

		if len(updates) > 0 {
			if err := tx.Model(&homework).Updates(updates).Error; err != nil {
				return err
			}
		}

		// Targets: only replace if class_year_ids provided
		if body.ClassYearIDs != nil {
			ids := *body.ClassYearIDs
			if len(ids) == 0 {
				return &httpError{fiber.StatusBadRequest, "at least one class_year_id is required"}
			}
			if err := tx.Where("homework_id = ?", homework.ID).Delete(&models.HomeworkTarget{}).Error; err != nil {
				return err
			}
			if err := h.validateAndInsertTargets(tx, schoolID, homework.ID, ids); err != nil {
				return err
			}
		}
		return nil
	})

	if err != nil {
		var he *httpError
		if errors.As(err, &he) {
			return c.Status(he.status).JSON(fiber.Map{"error": he.msg})
		}
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "homework not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "update failed"})
	}

	return h.GetOne(c)
}

// DELETE /api/homeworks/:id  (soft delete via is_active=false)
func (h *HomeworksHandler) Delete(c *fiber.Ctx) error {
	schoolID := middleware.GetSchoolID(c)

	id, err := strconv.Atoi(c.Params("id"))
	if err != nil || id <= 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid homework id"})
	}

	var homework models.Homework
	if err := h.DB.Where("id = ? AND school_id = ?", id, schoolID).First(&homework).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "homework not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "database error"})
	}
	if isTeacher(c) {
		if homework.TeacherID != middleware.GetTeacherID(c) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "homework not found"})
		}
	}

	if err := h.DB.Model(&homework).Update("is_active", false).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to delete homework"})
	}

	return c.JSON(fiber.Map{"message": "homework deleted"})
}

// validateAndInsertTargets verifies each class_year belongs to the school, then bulk-inserts.
func (h *HomeworksHandler) validateAndInsertTargets(tx *gorm.DB, schoolID, homeworkID uint, classYearIDs []uint) error {
	seen := map[uint]bool{}
	unique := make([]uint, 0, len(classYearIDs))
	for _, id := range classYearIDs {
		if id == 0 {
			return &httpError{fiber.StatusBadRequest, "invalid class_year_id"}
		}
		if !seen[id] {
			seen[id] = true
			unique = append(unique, id)
		}
	}

	var count int64
	if err := tx.Model(&models.ClassYear{}).
		Where("school_id = ? AND id IN ?", schoolID, unique).
		Count(&count).Error; err != nil {
		return err
	}
	if int(count) != len(unique) {
		return &httpError{fiber.StatusBadRequest, "one or more class_year_ids not found in this school"}
	}

	targets := make([]models.HomeworkTarget, 0, len(unique))
	for _, id := range unique {
		targets = append(targets, models.HomeworkTarget{HomeworkID: homeworkID, ClassYearID: id})
	}
	return tx.Create(&targets).Error
}
