package handlers

import (
	"strconv"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/ishansaini194/lms/api/internal/middleware"
	"gorm.io/gorm"
)

type AuditLogsHandler struct {
	DB *gorm.DB
}

func NewAuditLogsHandler(db *gorm.DB) *AuditLogsHandler {
	return &AuditLogsHandler{DB: db}
}

// toUint coerces a value scanned from a map[string]interface{} row into a uint.
// Returns ok=false for nil or zero (e.g. a null user_id).
func toUint(v interface{}) (uint, bool) {
	switch n := v.(type) {
	case int64:
		if n > 0 {
			return uint(n), true
		}
	case int:
		if n > 0 {
			return uint(n), true
		}
	case uint:
		if n > 0 {
			return n, true
		}
	case uint64:
		if n > 0 {
			return uint(n), true
		}
	case float64:
		if n > 0 {
			return uint(n), true
		}
	}
	return 0, false
}

// GET /api/audit-logs?entity_type=&entity_id=&user_id=&page=&limit=
func (h *AuditLogsHandler) List(c *fiber.Ctx) error {
	schoolID := middleware.GetSchoolID(c)
	entityType := strings.TrimSpace(c.Query("entity_type"))
	entityID := c.QueryInt("entity_id", 0)
	userID := c.QueryInt("user_id", 0)

	page := c.QueryInt("page", 1)
	limit := c.QueryInt("limit", 50)
	if limit > 100 {
		limit = 100
	}
	if limit < 1 {
		limit = 50
	}
	if page < 1 {
		page = 1
	}

	// Query the table directly into a generic map slice so we don't need a model.
	query := h.DB.Table("audit_logs").Where("school_id = ?", schoolID)
	if entityType != "" {
		query = query.Where("entity_type = ?", entityType)
	}
	if entityID > 0 {
		query = query.Where("entity_id = ?", entityID)
	}
	if userID > 0 {
		query = query.Where("user_id = ?", userID)
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to count audit logs"})
	}

	var logs []map[string]interface{}
	offset := (page - 1) * limit
	if err := query.
		Order("created_at DESC").
		Limit(limit).Offset(offset).
		Find(&logs).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to fetch audit logs"})
	}

	// Resolve actor names: collect user_ids from this page, do one batched
	// lookup, and stamp user_name onto each row.
	idSet := make(map[uint]struct{})
	for _, log := range logs {
		if id, ok := toUint(log["user_id"]); ok {
			idSet[id] = struct{}{}
		}
	}
	names := make(map[uint]string)
	if len(idSet) > 0 {
		ids := make([]uint, 0, len(idSet))
		for id := range idSet {
			ids = append(ids, id)
		}
		var users []struct {
			ID          uint
			Username    string
			DisplayName *string
		}
		if err := h.DB.Table("users").
			Select("id", "username", "display_name").
			Where("id IN ?", ids).
			Find(&users).Error; err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to resolve audit actors"})
		}
		for _, u := range users {
			if u.DisplayName != nil && strings.TrimSpace(*u.DisplayName) != "" {
				names[u.ID] = *u.DisplayName
			} else {
				names[u.ID] = u.Username
			}
		}
	}
	for _, log := range logs {
		if id, ok := toUint(log["user_id"]); ok {
			if name, found := names[id]; found {
				log["user_name"] = name
			} else {
				log["user_name"] = "—"
			}
		} else {
			log["user_name"] = "System"
		}
	}

	totalPages := int(total) / limit
	if int(total)%limit > 0 {
		totalPages++
	}
	_ = strconv.Itoa // keep import if unused elsewhere; remove if lint complains

	return c.JSON(fiber.Map{
		"data": logs, "total": total, "page": page, "limit": limit, "total_pages": totalPages,
	})
}
