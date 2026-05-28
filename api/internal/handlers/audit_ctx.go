package handlers

import (
	"github.com/gofiber/fiber/v2"
	"github.com/ishansaini194/lms/api/internal/middleware"
	"github.com/ishansaini194/lms/api/internal/services"
)

// auditCtx builds the common audit fields from the request.
func auditCtx(c *fiber.Ctx) services.Event {
	uid := middleware.GetUserID(c)
	return services.Event{
		UserID:   &uid,
		SchoolID: middleware.GetSchoolID(c),
		IP:       c.IP(),
	}
}
