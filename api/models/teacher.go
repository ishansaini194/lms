package models

import "time"

type Teacher struct {
	ID            uint   `gorm:"primaryKey" json:"id"`
	SchoolID      uint   `gorm:"not null;uniqueIndex:idx_teachers_school_emp;index:idx_teachers_school_active,priority:1" json:"school_id"`
	EmployeeID    string `gorm:"size:50;not null;uniqueIndex:idx_teachers_school_emp" json:"employee_id"`
	Name          string `gorm:"size:200;not null" json:"name"`
	Phone         string `gorm:"size:20" json:"phone,omitempty"`
	Email         string `gorm:"size:200" json:"email,omitempty"`
	Subject       string `gorm:"size:100" json:"subject,omitempty"`
	Qualification string `gorm:"size:200" json:"qualification,omitempty"`
	IsActive      bool   `gorm:"not null;default:true;index:idx_teachers_school_active,priority:2" json:"is_active"`

	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}
