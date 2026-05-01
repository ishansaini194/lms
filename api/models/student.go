package models

import "time"

type Student struct {
	ID              uint       `gorm:"primaryKey" json:"id"`
	SchoolID        uint       `gorm:"not null;uniqueIndex:idx_students_school_admission;index:idx_students_school_active,priority:1" json:"school_id"`
	AdmissionNumber string     `gorm:"size:50;not null;uniqueIndex:idx_students_school_admission" json:"admission_no"`
	EpunjabID       *string    `gorm:"size:50" json:"epunjab_id,omitempty"`
	Name            string     `gorm:"size:200;not null" json:"name"`
	Gender          *string    `gorm:"size:10" json:"gender,omitempty"`
	DateOfBirth     *time.Time `gorm:"type:date" json:"dob,omitempty"`
	Phone           *string    `gorm:"size:20" json:"phone,omitempty"`
	AadharNumber    *string    `gorm:"size:20" json:"aadhar_no,omitempty"`
	FatherName      *string    `gorm:"size:200" json:"father_name,omitempty"`
	FatherContact   *string    `gorm:"size:20" json:"father_contact,omitempty"`
	MotherName      *string    `gorm:"size:200" json:"mother_name,omitempty"`
	MotherContact   *string    `gorm:"size:20" json:"mother_contact,omitempty"`
	Caste           *string    `gorm:"size:50" json:"caste,omitempty"`
	Email           *string    `gorm:"size:200" json:"email,omitempty"`
	Address         *string    `gorm:"type:text" json:"address,omitempty"`
	IsActive        bool       `gorm:"not null;default:true;index:idx_students_school_active,priority:2" json:"is_active"`
	CreatedAt       time.Time  `json:"created_at"`
	UpdatedAt       time.Time  `json:"updated_at"`

	School School `gorm:"foreignKey:SchoolID" json:"-"`
}
