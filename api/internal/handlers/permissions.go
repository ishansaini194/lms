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

// teacherClassYearIDs returns the set of class_year IDs the teacher is
// connected to: class-years she is class teacher of, ∪ class-years she has an
// active teaching assignment in. Deduped. Used to scope roster/enrollment reads.
//
// We resolve the union into a Go slice (two cheap plucks) rather than an inline
// "IN (sub) OR IN (sub)" SQL condition: GORM only parenthesizes OrConditions
// (db.Or / gorm.Expr), NOT a raw string containing the literal "OR", so an
// inline OR would NOT be grouped and would break out of the school_id AND —
// a cross-tenant leak. A single "class_year_id IN ?" can't have that problem.
func teacherClassYearIDs(db *gorm.DB, teacherID, schoolID uint) []uint {
	var ctIDs []uint
	db.Model(&models.ClassYear{}).
		Where("school_id = ? AND class_teacher_id = ?", schoolID, teacherID).
		Pluck("id", &ctIDs)

	var taIDs []uint
	db.Model(&models.TeachingAssignment{}).
		Where("school_id = ? AND teacher_id = ? AND is_active = ?", schoolID, teacherID, true).
		Pluck("class_year_id", &taIDs)

	seen := make(map[uint]bool, len(ctIDs)+len(taIDs))
	out := make([]uint, 0, len(ctIDs)+len(taIDs))
	for _, id := range append(ctIDs, taIDs...) {
		if !seen[id] {
			seen[id] = true
			out = append(out, id)
		}
	}
	return out
}

// teacherCanSeeClassYear: class-teacher of OR active teaching assignment in the
// class_year. Mirrors the scope of teacherClassYearIDs for single-row checks.
func teacherCanSeeClassYear(db *gorm.DB, teacherID, classYearID, schoolID uint) bool {
	if teacherOwnsClassYear(db, teacherID, classYearID, schoolID) {
		return true
	}
	var count int64
	db.Model(&models.TeachingAssignment{}).
		Where("school_id = ? AND teacher_id = ? AND class_year_id = ? AND is_active = ?",
			schoolID, teacherID, classYearID, true).
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
