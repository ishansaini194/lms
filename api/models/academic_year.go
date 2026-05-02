package models

import "time"

type AcademicYear struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	SchoolID  uint      `gorm:"not null;index;uniqueIndex:idx_academic_year_school_name" json:"school_id"`
	YearLabel string    `gorm:"size:20;not null;uniqueIndex:idx_academic_year_school_name" json:"year_label"`
	StartDate time.Time `gorm:"type:date;not null" json:"start_date"`
	EndDate   time.Time `gorm:"type:date;not null" json:"end_date"`
	IsCurrent bool      `gorm:"not null;default:false" json:"is_current"`

	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}
