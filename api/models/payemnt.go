package models

import (
	"time"

	"github.com/shopspring/decimal"
)

type Payment struct {
	ID          uint            `gorm:"primaryKey" json:"id"`
	SchoolID    uint            `gorm:"not null;uniqueIndex:idx_payments_school_receipt;index:idx_payments_school_paid_at,priority:1" json:"school_id"`
	FeeID       uint            `gorm:"not null;index:idx_payments_fee" json:"fee_id"`
	ReceiptNo   string          `gorm:"size:50;not null;uniqueIndex:idx_payments_school_receipt" json:"receipt_no"`
	Amount      decimal.Decimal `gorm:"type:numeric(10,2);not null" json:"amount"`
	PaymentMode string          `gorm:"size:20;not null" json:"payment_mode"`
	PaidAt      time.Time       `gorm:"not null;index:idx_payments_school_paid_at,priority:2,sort:desc" json:"paid_at"`

	Status         string     `gorm:"size:20;not null;default:'completed'" json:"status"`
	ReversedAt     *time.Time `json:"reversed_at,omitempty"`
	ReversalReason *string    `gorm:"type:text" json:"reversal_reason,omitempty"`

	Notes *string `gorm:"type:text" json:"notes,omitempty"`

	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}
