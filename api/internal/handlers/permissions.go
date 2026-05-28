package handlers

import (
	"github.com/gofiber/fiber/v2"
	"github.com/ishansaini194/lms/api/internal/middleware"
	"github.com/ishansaini194/lms/api/internal/models"
	"gorm.io/gorm"
)

// teacherOwnsClassYear: is this teacher the class_teacher of the class_year?
func teacherOwnsClassYear(db *gorm.DB, teacherID, classYearID, schoolID uint) bool {
	var count int64
	db.Model(&models.ClassYear{}).
		Where("id = ? AND school_id = ? AND class_teacher_id = ?", classYearID, schoolID, teacherID).
		Count(&count)
	return count > 0
}

// teacherOwnsExam: is this teacher assigned to the exam?
func teacherOwnsExam(db *gorm.DB, teacherID, examID, schoolID uint) bool {
	var count int64
	db.Model(&models.Exam{}).
		Where("id = ? AND school_id = ? AND teacher_id = ?", examID, schoolID, teacherID).
		Count(&count)
	return count > 0
}

// teacherOwnsAssessment: is this teacher assigned to the assessment?
func teacherOwnsAssessment(db *gorm.DB, teacherID, assessmentID, schoolID uint) bool {
	var count int64
	db.Model(&models.Assessment{}).
		Where("id = ? AND school_id = ? AND teacher_id = ?", assessmentID, schoolID, teacherID).
		Count(&count)
	return count > 0
}

// isAdmin / isTeacher shortcuts
func isAdmin(c *fiber.Ctx) bool   { return middleware.GetRole(c) == "admin" }
func isTeacher(c *fiber.Ctx) bool { return middleware.GetRole(c) == "teacher" }
