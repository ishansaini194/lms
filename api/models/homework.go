package models

import (
	"time"

	"gorm.io/gorm"
)

type Homework struct {
	ID        uint `gorm:"primaryKey" json:"id"`
	SchoolID  uint `gorm:"not null;index:idx_homeworks_school_due,priority:1" json:"school_id"`
	TeacherID uint `gorm:"not null" json:"teacher_id"`

	Subject string     `gorm:"size:100;not null" json:"subject"`
	Content string     `gorm:"type:text;not null" json:"content"`
	DueDate *time.Time `gorm:"type:date;index:idx_homeworks_school_due,priority:2" json:"due_date,omitempty"`

	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
}
