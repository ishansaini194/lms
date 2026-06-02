package models

import "time"

// TeachingAssignment records that a teacher teaches a given subject to a
// class_year (the subject-teacher relationship). This is distinct from
// class_years.class_teacher_id, which is the single "class teacher" (owner)
// of a section.
type TeachingAssignment struct {
	ID          uint   `gorm:"primaryKey" json:"id"`
	SchoolID    uint   `gorm:"not null;index:idx_teaching_assignments_school" json:"school_id"`
	TeacherID   uint   `gorm:"not null;uniqueIndex:idx_teaching_assignment_unique;index:idx_teaching_assignments_teacher" json:"teacher_id"`
	ClassYearID uint   `gorm:"not null;uniqueIndex:idx_teaching_assignment_unique" json:"class_year_id"`
	Subject     string `gorm:"type:varchar(100);not null;uniqueIndex:idx_teaching_assignment_unique" json:"subject"`

	IsActive  bool      `gorm:"not null;default:true" json:"is_active"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}
