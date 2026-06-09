package models

import "time"

type Library struct {
	ID             uint      `gorm:"primaryKey" json:"id"`
	SchoolID       uint      `gorm:"not null;index:idx_library_school;index:idx_library_school_category,priority:1" json:"school_id"`
	UploadedByID   uint      `gorm:"not null;index:idx_library_uploader" json:"uploaded_by_id"`
	AcademicYearID uint      `gorm:"not null;index:idx_library_year" json:"academic_year_id"`
	Category       string    `gorm:"size:50;not null;index:idx_library_school_category,priority:2" json:"category"`
	Subject        *string   `gorm:"size:100" json:"subject,omitempty"`
	ClassNumber    *int      `gorm:"index:idx_library_class" json:"class_number,omitempty"` // legacy; superseded by ClassID
	ClassID        *uint     `gorm:"index:idx_library_class_id" json:"class_id,omitempty"`
	Title          string    `gorm:"size:200;not null" json:"title"`
	Description    *string   `gorm:"type:text" json:"description,omitempty"`
	FileUrl        string    `gorm:"size:500;not null" json:"file_url"`
	FileSize       int64     `gorm:"not null" json:"file_size"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`

	// ClassName is the grade label for ClassID, resolved at read time (not a
	// column). Lets the portals show "Class Nursery" without a second lookup.
	ClassName *string `gorm:"-" json:"class_name,omitempty"`
}

func (Library) TableName() string {
	return "library"
}
