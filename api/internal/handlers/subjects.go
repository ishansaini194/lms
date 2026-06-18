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

type SubjectsHandler struct {
	DB *gorm.DB
}

func NewSubjectsHandler(db *gorm.DB) *SubjectsHandler {
	return &SubjectsHandler{DB: db}
}

type createSubjectRequest struct {
	Name string `json:"name"`
}

type updateSubjectRequest struct {
	Name     *string `json:"name,omitempty"`
	IsActive *bool   `json:"is_active,omitempty"`
}

// subjectNamesByID resolves subject ids → name for a school, regardless of
// is_active (so files referencing a since-deactivated subject still label
// correctly). Shared by the library + homework read paths.
func subjectNamesByID(db *gorm.DB, schoolID uint, ids []uint) map[uint]string {
	out := map[uint]string{}
	if len(ids) == 0 {
		return out
	}
	type row struct {
		ID   uint
		Name string
	}
	var rows []row
	db.Table("subjects").Select("id, name").
		Where("school_id = ? AND id IN ?", schoolID, ids).
		Scan(&rows)
	for _, r := range rows {
		out[r.ID] = r.Name
	}
	return out
}

// GET /api/subjects  — active subjects for the school, ordered by name.
// Admins may pass ?include_inactive=true to also see deactivated ones.
func (h *SubjectsHandler) List(c *fiber.Ctx) error {
	schoolID := middleware.GetSchoolID(c)

	query := h.DB.Model(&models.Subject{}).Where("school_id = ?", schoolID)
	includeInactive, _ := strconv.ParseBool(c.Query("include_inactive"))
	if !(includeInactive && isAdmin(c)) {
		query = query.Where("is_active = ?", true)
	}

	var subjects []models.Subject
	if err := query.Order("name ASC").Find(&subjects).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to fetch subjects"})
	}
	return c.JSON(subjects)
}

// POST /api/subjects  (admin)
func (h *SubjectsHandler) Create(c *fiber.Ctx) error {
	schoolID := middleware.GetSchoolID(c)

	var body createSubjectRequest
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request"})
	}
	body.Name = strings.TrimSpace(body.Name)
	if body.Name == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "name is required"})
	}

	subject := models.Subject{SchoolID: schoolID, Name: body.Name, IsActive: true}
	if err := h.DB.Create(&subject).Error; err != nil {
		if isUniqueViolation(err) {
			return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "a subject with that name already exists"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to create subject"})
	}
	return c.Status(fiber.StatusCreated).JSON(subject)
}

// PUT /api/subjects/:id  (admin) — rename and/or reactivate via is_active.
func (h *SubjectsHandler) Update(c *fiber.Ctx) error {
	schoolID := middleware.GetSchoolID(c)
	id, err := strconv.Atoi(c.Params("id"))
	if err != nil || id <= 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid subject id"})
	}

	var body updateSubjectRequest
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request"})
	}

	var subject models.Subject
	if err := h.DB.Where("id = ? AND school_id = ?", id, schoolID).First(&subject).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "subject not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "database error"})
	}

	updates := map[string]interface{}{}
	if body.Name != nil {
		n := strings.TrimSpace(*body.Name)
		if n == "" {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "name cannot be empty"})
		}
		updates["name"] = n
	}
	if body.IsActive != nil {
		updates["is_active"] = *body.IsActive
	}

	if len(updates) > 0 {
		if err := h.DB.Model(&subject).Updates(updates).Error; err != nil {
			if isUniqueViolation(err) {
				return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "a subject with that name already exists"})
			}
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "update failed"})
		}
	}

	if err := h.DB.Where("id = ? AND school_id = ?", id, schoolID).First(&subject).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "update succeeded but reload failed"})
	}
	return c.JSON(subject)
}

// DELETE /api/subjects/:id  (admin) — soft delete (is_active=false). Files and
// homework that reference it keep working; the name still resolves on read.
func (h *SubjectsHandler) Delete(c *fiber.Ctx) error {
	schoolID := middleware.GetSchoolID(c)
	id, err := strconv.Atoi(c.Params("id"))
	if err != nil || id <= 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid subject id"})
	}

	var subject models.Subject
	if err := h.DB.Where("id = ? AND school_id = ?", id, schoolID).First(&subject).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "subject not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "database error"})
	}

	if err := h.DB.Model(&subject).Update("is_active", false).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to deactivate subject"})
	}
	return c.JSON(fiber.Map{"message": "subject deactivated"})
}

// subjectExistsInSchool reports whether a subject id belongs to this school
// (active or not — a homework/file may keep a deactivated subject). Used to
// validate subject_id on library/homework writes.
func subjectExistsInSchool(db *gorm.DB, subjectID, schoolID uint) bool {
	var count int64
	db.Model(&models.Subject{}).
		Where("id = ? AND school_id = ?", subjectID, schoolID).
		Count(&count)
	return count > 0
}

// subjectNameByID resolves a subject id to its master-list name within a school.
// Second return is false when the id doesn't belong to the school. Used to
// denormalize the name onto teacher / teaching_assignment writes.
func subjectNameByID(db *gorm.DB, subjectID, schoolID uint) (string, bool) {
	var s models.Subject
	if err := db.Select("name").
		Where("id = ? AND school_id = ?", subjectID, schoolID).
		First(&s).Error; err != nil {
		return "", false
	}
	return s.Name, true
}
