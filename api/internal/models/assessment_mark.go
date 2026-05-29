package models

import (
	"time"

	"github.com/shopspring/decimal"
)

type AssessmentMark struct {
	ID           uint            `gorm:"primaryKey" json:"id"`
	SchoolID     uint            `gorm:"not null;index:idx_assessment_marks_school" json:"school_id"`
	AssessmentID uint            `gorm:"not null;uniqueIndex:idx_assessment_marks_assessment_enrollment;" json:"assessment_id"`
	EnrollmentID uint            `gorm:"not null;uniqueIndex:idx_assessment_marks_assessment_enrollment;index:idx_assessment_marks_enrollment" json:"enrollment_id"`
	Marks        decimal.Decimal `gorm:"type:numeric(6,2);not null" json:"marks"`

	Assessment *Assessment `gorm:"foreignKey:AssessmentID" json:"assessment,omitempty"`

	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}
