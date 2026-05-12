package models

import (
	"time"
)

type Notice struct {
	ID         uint `gorm:"primaryKey" json:"id"`
	SchoolID   uint `gorm:"not null;index:idx_notices_school_created,priority:1" json:"school_id"`
	PostedByID uint `gorm:"not null" json:"posted_by_id"`

	Title           string `gorm:"size:200;not null" json:"title"`
	Body            string `gorm:"type:text;not null" json:"body"`
	TargetAllSchool bool   `gorm:"not null;default:false" json:"target_all_school"`

	CreatedAt time.Time `gorm:"index:idx_notices_school_created,priority:2,sort:desc" json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
	IsActive  bool      `gorm:"not null;default:true" json:"is_active"`
}
