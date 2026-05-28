package models

import "time"

type Class struct {
	ID       uint `gorm:"primaryKey" json:"id"`
	SchoolID uint `gorm:"not null;index:idx_classes_school" json:"school_id"`

	SortOrder int     `gorm:"not null;default:0" json:"sort_order"`
	Name      string  `gorm:"size:20;not null" json:"name"`
	Section   string  `gorm:"size:10;not null" json:"section"`
	Board     *string `gorm:"size:20;" json:"board"`

	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
	IsActive  bool      `gorm:"not null;default:true" json:"is_active"`
}
