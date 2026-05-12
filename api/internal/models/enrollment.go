package models

import "time"

type Enrollment struct {
	ID          uint `gorm:"primaryKey" json:"id"`
	SchoolID    uint `gorm:"not null;index:idx_enrollments_school" json:"school_id"`
	StudentID   uint `gorm:"not null;uniqueIndex:idx_enrollments_student_cy;index:idx_enrollments_student" json:"student_id"`
	ClassYearID uint `gorm:"not null;uniqueIndex:idx_enrollments_student_cy;uniqueIndex:idx_enrollments_cy_roll;index:idx_enrollments_class_year" json:"class_year_id"`

	IsActive   bool       `gorm:"not null;default:true" json:"is_active"`
	Status     string     `gorm:"size:20;not null;default:'active'" json:"status"`
	LeftOn     *time.Time `gorm:"type:date" json:"left_on,omitempty"`
	LeftReason *string    `gorm:"type:text" json:"left_reason,omitempty"`

	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}
