package models

import "time"

type ReceiptCounter struct {
	SchoolID   uint   `gorm:"primaryKey" json:"school_id"`
	PeriodKey  string `gorm:"size:50;primaryKey" json:"period_key"` // "25-26" | "continuous" | "2026-04"
	LastNumber int    `gorm:"not null;default:0" json:"last_number"`

	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}
