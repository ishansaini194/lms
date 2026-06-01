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

type UsersHandler struct {
	DB *gorm.DB
}

func NewUsersHandler(db *gorm.DB) *UsersHandler {
	return &UsersHandler{DB: db}
}

// userListItem is the Users & roles row: admins + teachers only. `Linked`
// describes the account — the teacher's name (and subject) for teacher logins,
// "Administrator" for admins. TeacherID is exposed so the frontend can route a
// teacher's deactivate through the teacher endpoints (which sync both rows).
type userListItem struct {
	ID          uint       `json:"id"`
	Username    string     `json:"username"`
	DisplayName *string    `json:"display_name"`
	Role        string     `json:"role"`
	IsActive    bool       `json:"is_active"`
	TeacherID   *uint      `json:"teacher_id"`
	LastLoginAt *time.Time `json:"last_login_at"`
	CreatedAt   time.Time  `json:"created_at"`
	Linked      *string    `json:"linked"`
}

// GET /api/users?include_inactive=&role=
// Lists the school's admin + teacher accounts (students are managed on the
// Students page). Active-only by default; ?role=admin|teacher narrows further.
func (h *UsersHandler) List(c *fiber.Ctx) error {
	schoolID := middleware.GetSchoolID(c)
	includeInactive, _ := strconv.ParseBool(c.Query("include_inactive"))
	roleFilter := strings.TrimSpace(c.Query("role"))

	query := h.DB.Model(&models.User{}).
		Where("school_id = ? AND role IN ?", schoolID, []string{"admin", "teacher"})
	if !includeInactive {
		query = query.Where("is_active = ?", true)
	}
	if roleFilter == "admin" || roleFilter == "teacher" {
		query = query.Where("role = ?", roleFilter)
	}

	var users []models.User
	if err := query.Order("role asc, username asc").Find(&users).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to fetch users"})
	}

	// One batched teacher lookup to resolve the "linked" label (no N+1).
	teacherIDs := make([]uint, 0, len(users))
	for _, u := range users {
		if u.TeacherID != nil {
			teacherIDs = append(teacherIDs, *u.TeacherID)
		}
	}
	type teacherRow struct {
		ID      uint
		Name    string
		Subject string
	}
	teacherByID := map[uint]teacherRow{}
	if len(teacherIDs) > 0 {
		var rows []teacherRow
		h.DB.Table("teachers").
			Select("id, name, subject").
			Where("school_id = ? AND id IN ?", schoolID, teacherIDs).
			Scan(&rows)
		for _, t := range rows {
			teacherByID[t.ID] = t
		}
	}

	items := make([]userListItem, len(users))
	for i, u := range users {
		item := userListItem{
			ID:          u.ID,
			Username:    u.Username,
			DisplayName: u.DisplayName,
			Role:        u.Role,
			IsActive:    u.IsActive,
			TeacherID:   u.TeacherID,
			LastLoginAt: u.LastLoginAt,
			CreatedAt:   u.CreatedAt,
		}
		switch {
		case u.Role == "teacher" && u.TeacherID != nil:
			if t, ok := teacherByID[*u.TeacherID]; ok {
				label := t.Name
				if strings.TrimSpace(t.Subject) != "" {
					label += " · " + t.Subject
				}
				item.Linked = &label
			}
		case u.Role == "admin":
			admin := "Administrator"
			item.Linked = &admin
		}
		items[i] = item
	}

	return c.JSON(items)
}

// POST /api/users/:id/deactivate — flips an *admin* user's is_active to false.
// Teacher accounts are handled via the teacher endpoints (which sync both the
// teacher and user rows), so this rejects users with a teacher link. An admin
// cannot deactivate their own account (self-lockout guard, compared against the
// JWT user id).
func (h *UsersHandler) Deactivate(c *fiber.Ctx) error {
	return h.setActive(c, false)
}

// POST /api/users/:id/reactivate — flips an admin user back to active.
func (h *UsersHandler) Reactivate(c *fiber.Ctx) error {
	return h.setActive(c, true)
}

func (h *UsersHandler) setActive(c *fiber.Ctx, active bool) error {
	schoolID := middleware.GetSchoolID(c)
	currentUserID := middleware.GetUserID(c)

	id, err := strconv.Atoi(c.Params("id"))
	if err != nil || id <= 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid user id"})
	}

	// Self-lockout guard: an admin must not deactivate their own account.
	if !active && uint(id) == currentUserID {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "you cannot deactivate your own account"})
	}

	var user models.User
	if err := h.DB.Where("id = ? AND school_id = ?", id, schoolID).First(&user).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "user not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "database error"})
	}

	// Teacher logins must go through the teacher endpoints so both rows stay
	// in sync; this path is admin-only.
	if user.TeacherID != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "manage teacher accounts via the teachers endpoint"})
	}

	if err := h.DB.Model(&user).Update("is_active", active).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "update failed"})
	}

	msg := "user reactivated"
	if !active {
		msg = "user deactivated"
	}
	return c.JSON(fiber.Map{"message": msg})
}
