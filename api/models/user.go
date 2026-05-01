package models

import "time"

type User struct {
	ID           uint       `gorm:"primaryKey" json:"id"`
	SchoolID     uint       `gorm:"not null;uniqueIndex:idx_users_school_username;index:idx_users_school_username_lookup,priority:1" json:"school_id"`
	Username     string     `gorm:"size:50;not null;uniqueIndex:idx_users_school_username;index:idx_users_school_username_lookup,priority:2" json:"username"`
	PasswordHash string     `gorm:"size:200;not null" json:"-"`   // never serialize
	Role         string     `gorm:"size:20;not null" json:"role"` // admin | teacher | student
	TeacherID    *uint      `json:"teacher_id,omitempty"`
	StudentID    *uint      `json:"student_id,omitempty"`
	IsActive     bool       `gorm:"not null;default:true" json:"is_active"`
	LastLoginAt  *time.Time `json:"last_login_at,omitempty"`
	CreatedAt    time.Time  `json:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at"`
}
