package models

type NoticeTarget struct {
	NoticeID    uint `gorm:"primaryKey;constraint:OnDelete:CASCADE" json:"notice_id"`
	ClassYearID uint `gorm:"primaryKey;constraint:OnDelete:CASCADE;index:idx_notice_targets_class" json:"class_year_id"`
}
