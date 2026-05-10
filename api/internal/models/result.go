package models

import (
	"time"

	"github.com/shopspring/decimal"
)

type Result struct {
	ID           uint            `gorm:"primaryKey" json:"id"`
	SchoolID     uint            `gorm:"not null;index:idx_results_school" json:"school_id"`
	ExamID       uint            `gorm:"not null;uniqueIndex:idx_results_exam_enrollment;" json:"exam_id"`
	EnrollmentID uint            `gorm:"not null;uniqueIndex:idx_results_exam_enrollment;index:idx_results_enrollment" json:"enrollment_id"`
	Marks        decimal.Decimal `gorm:"type:numeric(6,2);not null" json:"marks"`

	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}
