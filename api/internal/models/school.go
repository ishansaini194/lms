package models

import (
	"time"
)

type School struct {
	ID                 uint      `gorm:"primaryKey;autoIncrement" json:"id"`
	Name               string    `gorm:"type:varchar(200);not null" json:"name"`
	Code               string    `gorm:"type:varchar(20);uniqueIndex;not null" json:"code"`
	Address            string    `gorm:"type:text" json:"address"`
	Phone              string    `gorm:"type:varchar(20)" json:"phone"`
	Email              string    `gorm:"type:varchar(200)" json:"email"`
	LogoURL            string    `gorm:"type:varchar(500)" json:"logo_url"`
	ReceiptFormat      string    `gorm:"type:varchar(100);default:'${code}/${yy}-${yy_next}/${seq:0000}'" json:"receipt_format"`
	ReceiptReset       string    `gorm:"type:varchar(20);default:'yearly'" json:"receipt_reset"`
	ReceiptStartingNum int       `gorm:"default:1" json:"receipt_starting_num"`
	SmsEnabled         bool      `gorm:"default:false" json:"sms_enabled"`
	CreatedAt          time.Time `json:"created_at"`
	UpdatedAt          time.Time `json:"updated_at"`
}
