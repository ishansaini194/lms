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

	totalPages := int(total) / limit
	if int(total)%limit > 0 {
		totalPages++
	}
	_ = strconv.Itoa // keep import if unused elsewhere; remove if lint complains

	return c.JSON(fiber.Map{
		"data": logs, "total": total, "page": page, "limit": limit, "total_pages": totalPages,
	})
}
