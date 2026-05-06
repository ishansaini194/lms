package models

import (
	"time"

	"github.com/shopspring/decimal"
)

type Fee struct {
	ID           uint   `gorm:"primaryKey" json:"id"`
	SchoolID     uint   `gorm:"not null;index:idx_fees_school" json:"school_id"`
	EnrollmentID uint   `gorm:"not null;uniqueIndex:idx_fees_enr_type_month;index:idx_fees_enr_status,priority:1" json:"enrollment_id"`
	FeeType      string `gorm:"size:20;not null;uniqueIndex:idx_fees_enr_type_month" json:"fee_type"`

	Month          int             `gorm:"not null;uniqueIndex:idx_fees_enr_type_month" json:"month"`
	Amount         decimal.Decimal `gorm:"type:numeric(10,2);not null" json:"amount"`
	Discount       decimal.Decimal `gorm:"type:numeric(10,2);not null;default:0" json:"discount"`
	NetAmount      decimal.Decimal `gorm:"type:numeric(10,2);not null" json:"net_amount"`
	DiscountReason *string         `gorm:"size:200" json:"discount_reason,omitempty"`

	Status    string    `gorm:"size:20;not null;default:'unpaid';index:idx_fees_enr_status,priority:2" json:"status"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}
