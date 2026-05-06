package models

import "time"

type AuditLog struct {
	ID         uint      `gorm:"primaryKey" json:"id"`
	SchoolID   uint      `gorm:"not null;index:idx_audit_school_entity,priority:1;index:idx_audit_school_created,priority:1" json:"school_id"`
	UserID     *uint     `gorm:"index:idx_audit_user" json:"user_id,omitempty"`
	Action     string    `gorm:"size:50;not null" json:"action"`
	EntityType string    `gorm:"size:50;not null;index:idx_audit_school_entity,priority:2" json:"entity_type"`
	EntityID   uint      `gorm:"not null;index:idx_audit_school_entity,priority:3" json:"entity_id"`
	Before     []byte    `gorm:"type:jsonb" json:"before,omitempty"`
	After      []byte    `gorm:"type:jsonb" json:"after,omitempty"`
	Reason     *string   `gorm:"type:text" json:"reason,omitempty"`
	IPAddress  *string   `gorm:"size:50;column:ip_address" json:"ip_address,omitempty"`
	CreatedAt  time.Time `gorm:"index:idx_audit_school_created,priority:2,sort:desc" json:"created_at"`
}
