package models

import "time"

// ExamTerm is a school-wide exam term (e.g. Mid-Term, Final, Unit Test 1) tied
// to an academic year. It groups the per-class-year subject-exams that sit under
// it; those exams keep their own subject/max_marks/teacher/date. The term is
// unique per (school, academic_year, name).
type ExamTerm struct {
	ID             uint `gorm:"primaryKey" json:"id"`
	SchoolID       uint `gorm:"not null;index:idx_exam_terms_school;uniqueIndex:idx_exam_term_unique" json:"school_id"`
	AcademicYearID uint `gorm:"not null;uniqueIndex:idx_exam_term_unique;index:idx_exam_terms_year" json:"academic_year_id"`

	Name      string `gorm:"type:varchar(100);not null;uniqueIndex:idx_exam_term_unique" json:"name"`
	SortOrder int    `gorm:"not null;default:0" json:"sort_order"`

	IsActive  bool      `gorm:"not null;default:true" json:"is_active"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}
