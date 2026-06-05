package models

import "time"

// PushSubscription is one Web Push subscription — a single device/browser
// endpoint owned by a user. The endpoint is globally unique (the same device
// always produces the same endpoint), so re-subscribing upserts on it. The
// p256dh + auth keys are needed to encrypt push payloads when sending.
type PushSubscription struct {
	ID       uint `gorm:"primaryKey" json:"id"`
	SchoolID uint `gorm:"not null;index:idx_push_subscriptions_school" json:"school_id"`
	UserID   uint `gorm:"not null;index:idx_push_subscriptions_user" json:"user_id"`

	Endpoint string `gorm:"type:text;not null;uniqueIndex" json:"endpoint"`
	P256dh   string `gorm:"type:text;not null" json:"p256dh"`
	Auth     string `gorm:"type:text;not null" json:"auth"`

	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}
