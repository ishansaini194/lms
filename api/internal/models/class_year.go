package models

import (
	"time"

	"github.com/shopspring/decimal"
)

type ClassYear struct {
	ID             uint  `gorm:"primaryKey" json:"id"`
	SchoolID       uint  `gorm:"not null;index:idx_class_years_school" json:"school_id"`
	ClassID        uint  `gorm:"not null;index:idx_class_years_class;uniqueIndex:idx_class_year_unique" json:"class_id"`
	AcademicYearID uint  `gorm:"not null;uniqueIndex:idx_class_year_unique;index:idx_class_years_year" json:"academic_year_id"`
	ClassTeacherID *uint `gorm:"index:idx_class_years_teacher" json:"class_teacher_id,omitempty"`

	TuitionFee   decimal.Decimal `gorm:"type:numeric(10,2);not null;default:0" json:"tuition_fee"`
	TransportFee decimal.Decimal `gorm:"type:numeric(10,2);not null;default:0" json:"transport_fee"`

	// Relationships — for Preload in List/GetOne
	Class        Class        `gorm:"foreignKey:ClassID" json:"class,omitempty"`
	AcademicYear AcademicYear `gorm:"foreignKey:AcademicYearID" json:"academic_year,omitempty"`
	ClassTeacher *Teacher     `gorm:"foreignKey:ClassTeacherID" json:"class_teacher,omitempty"`

	IsActive  bool      `gorm:"not null;default:true" json:"is_active"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}
