package models

import "time"

type Exam struct {
	ID          uint  `gorm:"primaryKey" json:"id"`
	SchoolID    uint  `gorm:"not null;index:idx_exams_school" json:"school_id"`
	ClassYearID uint  `gorm:"not null;index:idx_exams_class_year" json:"class_year_id"`
	TeacherID   *uint `gorm:"index:idx_exams_teacher" json:"teacher_id,omitempty"`
	// School-wide term this subject-exam belongs to. Nullable at the DB level
	// (legacy exams predate terms) but required by CreateExamRequest going forward.
	ExamTermID uint `gorm:"index:idx_exams_exam_term" json:"exam_term_id"`

	Name     string     `gorm:"size:100;not null" json:"name"`
	Subject  string     `gorm:"size:100;not null" json:"subject"`
	MaxMarks int        `gorm:"not null" json:"max_marks"`
	ExamDate *time.Time `gorm:"type:date" json:"exam_date,omitempty"`
	IsActive bool       `gorm:"not null;default:true" json:"is_active"`

	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}
