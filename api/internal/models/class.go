package models

import "time"

type Class struct {
	ID        uint    `gorm:"primaryKey" json:"id"`
	SchoolID  uint    `gorm:"not null;uniqueIndex:idx_school_num_sec;index:idx_classes_school" json:"school_id"`
	Name      string  `gorm:"size:20;not null" json:"name"`
	SortOrder int     `gorm:"not null;default:0" json:"sort_order"`
	Section   string  `gorm:"size:10;not null;uniqueIndex:idx_classes_school_num_sec" json:"section"`
	Board     *string `gorm:"size:20;" json:"board"`

	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
	IsActive  bool      `gorm:"not null;default:true" json:"is_active"`
}
