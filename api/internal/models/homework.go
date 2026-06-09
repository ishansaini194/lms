package models

import (
	"time"
)

type Homework struct {
	ID        uint `gorm:"primaryKey" json:"id"`
	SchoolID  uint `gorm:"not null;index:idx_homeworks_school_due,priority:1" json:"school_id"`
	TeacherID uint `gorm:"not null" json:"teacher_id"`

	SubjectID *uint      `gorm:"index" json:"subject_id,omitempty"`
	Content   string     `gorm:"type:text;not null" json:"content"`
	DueDate   *time.Time `gorm:"type:date;index:idx_homeworks_school_due,priority:2" json:"due_date,omitempty"`

	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
	IsActive  bool      `gorm:"not null;default:true" json:"is_active"`

	// SubjectName is the master-list name for SubjectID, resolved at read time
	// (not a column). nil when the homework has no subject.
	SubjectName *string `gorm:"-" json:"subject_name,omitempty"`
}
