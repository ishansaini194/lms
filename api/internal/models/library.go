package models

import "time"

type Library struct {
	ID           uint      `gorm:"primaryKey" json:"id"`
	SchoolID     uint      `gorm:"not null;index:idx_library_school;index:idx_library_school_category,priority:1" json:"school_id"`
	UploadedByID uint      `gorm:"not null" json:"uploaded_by_id"`
	Category     string    `gorm:"size:20;not null;index:idx_library_school_category,priority:2" json:"category"` // notes | pyq
	SubjectID    *uint     `gorm:"index" json:"subject_id,omitempty"`
	Title        string    `gorm:"size:200;not null" json:"title"`
	FileUrl      string    `gorm:"type:text;not null" json:"file_url"`
	FileSize     int64     `gorm:"not null" json:"file_size"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`

	// SubjectName is the master-list name for SubjectID, resolved at read time
	// (not a column). nil when the file has no subject.
	SubjectName *string `gorm:"-" json:"subject_name,omitempty"`
}

func (Library) TableName() string {
	return "library"
}

// LibraryTarget links a library file to a class_year it's shared with. Mirrors
// HomeworkTarget — multi-section targeting, composite PK, cascade on file delete.
type LibraryTarget struct {
	LibraryID   uint `gorm:"primaryKey" json:"library_id"`
	ClassYearID uint `gorm:"primaryKey;index:idx_library_targets_class" json:"class_year_id"`
}
