package handlers

import (
	"errors"
	"strconv"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/ishansaini194/lms/api/internal/auth"
	"github.com/ishansaini194/lms/api/internal/middleware"
	"github.com/ishansaini194/lms/api/internal/models"
	"gorm.io/gorm"
)

type TeachersHandler struct {
	DB *gorm.DB
}

func NewTeachersHandler(db *gorm.DB) *TeachersHandler {
	return &TeachersHandler{DB: db}
}

// teacherNamesByID returns id→name for the given teacher ids in one batched
// query (no N+1). Mirrors subjectNamesByID; school-scoped. Missing ids are
// simply absent from the map.
func teacherNamesByID(db *gorm.DB, schoolID uint, ids []uint) map[uint]string {
	out := map[uint]string{}
	if len(ids) == 0 {
		return out
	}
	type row struct {
		ID   uint
		Name string
	}
	var rows []row
	db.Table("teachers").Select("id, name").
		Where("school_id = ? AND id IN ?", schoolID, ids).
		Scan(&rows)
	for _, r := range rows {
		out[r.ID] = r.Name
	}
	return out
}

// teacherListItem enriches a Teacher with the class(es) they are class-teacher
// of for the current academic year. The embedded Teacher flattens into the same
// JSON object.
type teacherListItem struct {
	models.Teacher
	ClassTeacherOf []string `json:"class_teacher_of"` // class labels e.g. ["5-A"]; empty if none
	UserID         *uint    `json:"user_id"`          // linked login account, for password reset
	Username       *string  `json:"username"`         // linked login username, for admin lookup
}

// enrichTeachers attaches class_teacher_of (current-AY class labels) to a page
// of teachers via one batched query (no N+1). Order is preserved.
func (h *TeachersHandler) enrichTeachers(schoolID uint, teachers []models.Teacher) []teacherListItem {
	items := make([]teacherListItem, len(teachers))
	for i := range teachers {
		items[i] = teacherListItem{Teacher: teachers[i], ClassTeacherOf: []string{}}
	}
	if len(teachers) == 0 {
		return items
	}

	ids := make([]uint, len(teachers))
	for i := range teachers {
		ids[i] = teachers[i].ID
	}

	// Linked login account per teacher (for password reset).
	type userRow struct {
		ID        uint
		TeacherID uint
		Username  string
	}
	var userRows []userRow
	h.DB.Table("users").
		Select("id, teacher_id, username").
		Where("school_id = ? AND teacher_id IN ?", schoolID, ids).
		Scan(&userRows)
	userByTeacher := map[uint]userRow{}
	for _, u := range userRows {
		userByTeacher[u.TeacherID] = u
	}
	for i := range items {
		if user, ok := userByTeacher[items[i].ID]; ok {
			id := user.ID
			username := user.Username
			items[i].UserID = &id
			items[i].Username = &username
		}
	}

	// Resolve the current academic year (standard is_current lookup).
	var currentAY models.AcademicYear
	if h.DB.Where("school_id = ? AND is_current = ?", schoolID, true).First(&currentAY).Error != nil {
		return items // no current AY → no class-teacher-of labels (user_id still set)
	}

	type tcRow struct {
		ClassTeacherID uint
		Name           string
		Section        string
	}
	var rows []tcRow
	h.DB.Table("class_years").
		Select("class_years.class_teacher_id, classes.name, classes.section").
		Joins("JOIN classes ON classes.id = class_years.class_id").
		Where("class_years.school_id = ? AND class_years.academic_year_id = ? AND class_years.is_active = ? AND class_years.class_teacher_id IN ?",
			schoolID, currentAY.ID, true, ids).
		Scan(&rows)

	labelsByTeacher := map[uint][]string{}
	for _, r := range rows {
		label := r.Name
		if r.Section != "" {
			label += "-" + r.Section
		}
		labelsByTeacher[r.ClassTeacherID] = append(labelsByTeacher[r.ClassTeacherID], label)
	}
	for i := range items {
		if labels, ok := labelsByTeacher[items[i].ID]; ok {
			items[i].ClassTeacherOf = labels
		}
	}
	return items
}

// GET /api/teachers
func (h *TeachersHandler) ListTeachers(c *fiber.Ctx) error {
	schoolID := middleware.GetSchoolID(c)
	includeInactive, _ := strconv.ParseBool(c.Query("include_inactive"))

	query := h.DB.Where("school_id = ?", schoolID)
	if !includeInactive {
		query = query.Where("is_active = ?", true)
	}

	var teachers []models.Teacher
	if err := query.Order("name asc").Find(&teachers).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to fetch teachers"})
	}
	return c.JSON(h.enrichTeachers(schoolID, teachers))
}

// GET /api/teachers/:id
func (h *TeachersHandler) GetTeacher(c *fiber.Ctx) error {
	schoolID := middleware.GetSchoolID(c)

	id, err := strconv.Atoi(c.Params("id"))
	if err != nil || id <= 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid teacher id"})
	}

	var teacher models.Teacher
	if err := h.DB.Where("id = ? AND school_id = ?", id, schoolID).First(&teacher).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "teacher not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "database error"})
	}

	return c.JSON(teacher)
}

// POST /api/teachers
func (h *TeachersHandler) CreateTeacher(c *fiber.Ctx) error {
	schoolID := middleware.GetSchoolID(c)

	var body struct {
		Name          string `json:"name"`
		EmployeeID    string `json:"employee_id"`
		Phone         string `json:"phone"`
		Email         string `json:"email"`
		Subject       string `json:"subject"`     // legacy free-text; used if SubjectID is absent
		SubjectID     *uint  `json:"subject_id"`  // preferred: a subjects master-list id
		Qualification string `json:"qualification"`
		Username      string `json:"username"`
	}

	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request"})
	}

	body.Name = strings.TrimSpace(body.Name)
	body.EmployeeID = strings.TrimSpace(body.EmployeeID)
	body.Username = strings.TrimSpace(body.Username)
	body.Phone = strings.TrimSpace(body.Phone)
	body.Email = strings.TrimSpace(body.Email)
	body.Subject = strings.TrimSpace(body.Subject)
	body.Qualification = strings.TrimSpace(body.Qualification)

	if body.Name == "" || body.EmployeeID == "" || body.Username == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "name, employee_id, and username are required"})
	}

	// Prefer the master-list subject_id; resolve to its name so the legacy
	// `subject` label stays in sync. Fall back to free-text for older clients.
	var subjectID *uint
	if body.SubjectID != nil && *body.SubjectID > 0 {
		name, ok := subjectNameByID(h.DB, *body.SubjectID, schoolID)
		if !ok {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "subject not found in this school"})
		}
		body.Subject = name
		subjectID = body.SubjectID
	}

	hash, err := auth.HashPassword(auth.DefaultPassword)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to hash password"})
	}

	teacher := models.Teacher{
		SchoolID:      schoolID,
		Name:          body.Name,
		EmployeeID:    body.EmployeeID,
		Phone:         body.Phone,
		Email:         body.Email,
		Subject:       body.Subject,
		SubjectID:     subjectID,
		Qualification: body.Qualification,
		IsActive:      true,
	}

	user := models.User{
		SchoolID:     schoolID,
		Username:     body.Username,
		PasswordHash: hash,
		Role:         "teacher",
		DisplayName:  &body.Name,
		IsActive:     true,
	}

	err = h.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&teacher).Error; err != nil {
			return err
		}
		user.TeacherID = &teacher.ID
		return tx.Create(&user).Error
	})

	if err != nil {
		if isUniqueViolation(err) {
			return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "username or employee_id already exists"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to create teacher"})
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"message":    "teacher created",
		"teacher_id": teacher.ID,
		"user_id":    user.ID,
		"login_info": fiber.Map{
			"username": body.Username,
			"password": auth.DefaultPassword,
		},
	})
}

// PUT /api/teachers/:id
func (h *TeachersHandler) UpdateTeacher(c *fiber.Ctx) error {
	schoolID := middleware.GetSchoolID(c)

	id, err := strconv.Atoi(c.Params("id"))
	if err != nil || id <= 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid teacher id"})
	}

	var teacher models.Teacher
	if err := h.DB.Where("id = ? AND school_id = ?", id, schoolID).First(&teacher).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "teacher not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "database error"})
	}

	var body struct {
		Name          *string `json:"name,omitempty"`
		Phone         *string `json:"phone,omitempty"`
		Email         *string `json:"email,omitempty"`
		Subject       *string `json:"subject,omitempty"`
		SubjectID     *uint   `json:"subject_id,omitempty"` // preferred; 0 clears the link
		Qualification *string `json:"qualification,omitempty"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request"})
	}

	updates := map[string]interface{}{}

	if body.Name != nil {
		trimmed := strings.TrimSpace(*body.Name)
		if trimmed == "" {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "name cannot be empty"})
		}
		updates["name"] = trimmed
	}

	if body.Phone != nil {
		updates["phone"] = *body.Phone
	}
	if body.Email != nil {
		updates["email"] = *body.Email
	}
	// Subject: prefer subject_id (resolve to its name; 0 clears the link). Fall
	// back to legacy free-text subject when no subject_id is sent.
	if body.SubjectID != nil {
		if *body.SubjectID == 0 {
			updates["subject_id"] = nil
			updates["subject"] = ""
		} else {
			name, ok := subjectNameByID(h.DB, *body.SubjectID, schoolID)
			if !ok {
				return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "subject not found in this school"})
			}
			updates["subject_id"] = *body.SubjectID
			updates["subject"] = name
		}
	} else if body.Subject != nil {
		updates["subject"] = *body.Subject
	}
	if body.Qualification != nil {
		updates["qualification"] = *body.Qualification
	}

	if len(updates) == 0 {
		return c.JSON(teacher) // nothing to update; return current state
	}

	if err := h.DB.Model(&teacher).Updates(updates).Error; err != nil {
		if isUniqueViolation(err) {
			return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "employee_id already exists"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "update failed"})
	}

	if err := h.DB.First(&teacher, teacher.ID).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "update succeeded but reload failed"})
	}

	return c.JSON(teacher)
}

// DELETE /api/teachers/:id
func (h *TeachersHandler) DeleteTeacher(c *fiber.Ctx) error {
	schoolID := middleware.GetSchoolID(c)

	id, err := strconv.Atoi(c.Params("id"))
	if err != nil || id <= 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid teacher id"})
	}

	err = h.DB.Transaction(func(tx *gorm.DB) error {
		result := tx.Model(&models.Teacher{}).
			Where("id = ? AND school_id = ?", id, schoolID).
			Update("is_active", false)
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected == 0 {
			return gorm.ErrRecordNotFound
		}

		return tx.Model(&models.User{}).
			Where("teacher_id = ? AND school_id = ?", id, schoolID).
			Update("is_active", false).Error
	})

	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "teacher not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to deactivate"})
	}

	return c.JSON(fiber.Map{"message": "teacher deactivated"})
}

// POST /api/teachers/:id/reactivate — flips a soft-deleted teacher (and their
// linked user) back to active. Mirrors DeleteTeacher's structure.
func (h *TeachersHandler) ReactivateTeacher(c *fiber.Ctx) error {
	schoolID := middleware.GetSchoolID(c)

	id, err := strconv.Atoi(c.Params("id"))
	if err != nil || id <= 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid teacher id"})
	}

	err = h.DB.Transaction(func(tx *gorm.DB) error {
		result := tx.Model(&models.Teacher{}).
			Where("id = ? AND school_id = ?", id, schoolID).
			Update("is_active", true)
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected == 0 {
			return gorm.ErrRecordNotFound
		}

		return tx.Model(&models.User{}).
			Where("teacher_id = ? AND school_id = ?", id, schoolID).
			Update("is_active", true).Error
	})

	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "teacher not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to reactivate"})
	}

	var teacher models.Teacher
	if err := h.DB.Where("id = ? AND school_id = ?", id, schoolID).First(&teacher).Error; err != nil {
		return c.JSON(fiber.Map{"ok": true})
	}
	return c.JSON(teacher)
}
