package models

import "time"

type Class struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	SchoolID  uint      `gorm:"not null;uniqueIndex:idx_school_num_sec;index:idx_classes_school" json:"school_id"`
	Number    int       `gorm:"not null;uniqueIndex:idx_classes_school_num_sec" json:"number"`
	Section   string    `gorm:"size:10;not null;uniqueIndex:idx_classes_school_num_sec" json:"section"`
	Board     string    `gorm:"size:20;not null" json:"board"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
	DeletedAt time.Time `gorm:"index" json:"-"`

	School School `gorm:"foreignKey:SchoolID" json:"-"`
}
