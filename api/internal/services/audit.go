package services

import (
	"encoding/json"
	"time"

	"gorm.io/gorm"
)

// Event is a single audit entry. Before/After are arbitrary structs (or nil).
type Event struct {
	UserID     *uint
	SchoolID   uint
	IP         string
	Action     string // "create" | "update" | "reverse" | "promote" | "status_change"
	EntityType string // "fee" | "payment" | "enrollment" | ...
	EntityID   uint
	Before     interface{} // nil for creates
	After      interface{} // nil for deletes
	Reason     string      // optional
}

// auditLog mirrors the audit_logs table. Kept local so the package owns its write.
type auditLog struct {
	ID         uint            `gorm:"primaryKey"`
	SchoolID   uint            `gorm:"column:school_id"`
	UserID     *uint           `gorm:"column:user_id"`
	Action     string          `gorm:"column:action"`
	EntityType string          `gorm:"column:entity_type"`
	EntityID   uint            `gorm:"column:entity_id"`
	Before     json.RawMessage `gorm:"column:before;type:jsonb"`
	After      json.RawMessage `gorm:"column:after;type:jsonb"`
	Reason     string          `gorm:"column:reason"`
	IPAddress  string          `gorm:"column:ip_address"`
	CreatedAt  time.Time       `gorm:"column:created_at"`
}

func (auditLog) TableName() string { return "audit_logs" }

// Log writes an audit entry inside the given (transaction) DB handle.
// It marshals Before/After to JSON. A failed marshal stores null rather than
// blocking the business operation.
func Log(tx *gorm.DB, e Event) error {
	row := auditLog{
		SchoolID:   e.SchoolID,
		UserID:     e.UserID,
		Action:     e.Action,
		EntityType: e.EntityType,
		EntityID:   e.EntityID,
		Reason:     e.Reason,
		IPAddress:  e.IP,
	}
	if e.Before != nil {
		if b, err := json.Marshal(e.Before); err == nil {
			row.Before = b
		}
	}
	if e.After != nil {
		if a, err := json.Marshal(e.After); err == nil {
			row.After = a
		}
	}
	return tx.Create(&row).Error
}
