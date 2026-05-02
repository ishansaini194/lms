package models

import (
	"time"

	"github.com/shopspring/decimal"
)

type ClassYear struct {
	ID       uint `gorm:"primaryKey" json:"id"`
	SchoolID uint `gorm:"not null;index:idx_class_years_school" json:"school_id"`
	ClassID  uint `gorm:"not null;index:idx_class_years_class" json:"class_id"`

	AcademicYearID uint  `gorm:"not null; uniqueIndex:idx_class_years_class_year;index:idx_class_years_year" json:"academic_year_id"`
	ClassTeacherID *uint `gorm:"index:idx_class_years_teacher" json:"class_teacher_id,omitempty"`

	TutionFee    decimal.Decimal
	TransportFee decimal.Decimal

	CreatedAt time.Time
	UpdatedAt time.Time
	DeletedAt time.Time `gorm:"index"`

	School School `gorm:"foreignKey:SchoolID" json:"-"`
}
