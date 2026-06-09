package models

import "time"

// Subject is a per-school master entry for a subject name. Homework and library
// files reference it by id. Soft-deleted (is_active=false) — never hard-delete
// one that files/homework still reference.
type Subject struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	SchoolID  uint      `gorm:"not null;index:idx_subjects_school;uniqueIndex:idx_subjects_school_name,priority:1" json:"school_id"`
	Name      string    `gorm:"size:100;not null;uniqueIndex:idx_subjects_school_name,priority:2" json:"name"`
	IsActive  bool      `gorm:"not null;default:true" json:"is_active"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}
