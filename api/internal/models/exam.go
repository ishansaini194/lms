package models

import "time"

type Exam struct {
	ID          uint  `gorm:"primaryKey" json:"id"`
	SchoolID    uint  `gorm:"not null;index:idx_exams_school" json:"school_id"`
	ClassYearID uint  `gorm:"not null;index:idx_exams_class_year" json:"class_year_id"`
	TeacherID   *uint `gorm:"index:idx_exams_teacher" json:"teacher_id,omitempty"`

	Name     string     `gorm:"size:100;not null" json:"name"`
	Subject  string     `gorm:"size:100;not null" json:"subject"`
	MaxMarks int        `gorm:"not null" json:"max_marks"`
	ExamDate *time.Time `gorm:"type:date" json:"exam_date,omitempty"`

	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}
