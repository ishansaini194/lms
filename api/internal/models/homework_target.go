package models

type HomeworkTarget struct {
	HomeworkID  uint `gorm:"primaryKey;" json:"homework_id"`
	ClassYearID uint `gorm:"primaryKey;;index:idx_homework_targets_class" json:"class_year_id"`
}
