package models

import "time"

type Assessment struct {
	ID        uint `gorm:"primaryKey" json:"id"`
	SchoolID  uint `gorm:"not null;index:idx_assessments_school" json:"school_id"`
	ExamID    uint `gorm:"not null;index:idx_assessments_exam;" json:"exam_id"`
	TeacherID uint `gorm:"not null;index:idx_assessments_teacher" json:"teacher_id"`

	Name     string `gorm:"size:100;not null" json:"name"`
	MaxMarks int    `gorm:"not null" json:"max_marks"`

	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}
