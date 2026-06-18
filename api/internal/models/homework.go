package models

import (
	"time"
)

type Homework struct {
	ID        uint `gorm:"primaryKey" json:"id"`
	SchoolID  uint `gorm:"not null;index:idx_homeworks_school_due,priority:1" json:"school_id"`
	TeacherID uint `gorm:"not null" json:"teacher_id"`

	SubjectID *uint      `gorm:"index" json:"subject_id,omitempty"`
	Content   string     `gorm:"type:text;not null" json:"content"`
	DueDate   *time.Time `gorm:"type:date;index:idx_homeworks_school_due,priority:2" json:"due_date,omitempty"`

	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
	IsActive  bool      `gorm:"not null;default:true" json:"is_active"`

	// SubjectName is the master-list name for SubjectID, resolved at read time
	// (not a column). nil when the homework has no subject.
	SubjectName *string `gorm:"-" json:"subject_name,omitempty"`

	// TeacherName is the posting teacher's name for TeacherID, resolved at read
	// time (not a column). nil when the teacher can't be resolved.
	TeacherName *string `gorm:"-" json:"teacher_name,omitempty"`

	// Attachments are the homework's files, resolved at read time (not a column).
	// Always serialized as an array (never null) so the client can iterate safely.
	Attachments []HomeworkAttachment `gorm:"-" json:"attachments"`
}

// HomeworkAttachment is a single image/PDF file attached to a homework. Multiple
// per homework; rows cascade-delete with the homework. Files live on disk under
// the homework upload dir; FileUrl is a relative ref resolved at download time.
type HomeworkAttachment struct {
	ID          uint      `gorm:"primaryKey" json:"id"`
	SchoolID    uint      `gorm:"not null;index" json:"school_id"`
	HomeworkID  uint      `gorm:"not null;index" json:"homework_id"`
	FileUrl     string    `gorm:"type:text;not null" json:"file_url"`
	FileName    string    `gorm:"size:255;not null" json:"file_name"`     // original name, for display + download
	ContentType string    `gorm:"size:100;not null" json:"content_type"`  // image/jpeg | image/png | application/pdf
	FileSize    int64     `gorm:"not null" json:"file_size"`
	CreatedAt   time.Time `json:"created_at"`
}
