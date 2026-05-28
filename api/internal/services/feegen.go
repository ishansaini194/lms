package feegen

import (
	"time"

	"github.com/ishansaini194/lms/api/internal/models"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// Result reports what a generation run did.
type Result struct {
	Created int `json:"created"`
	Skipped int `json:"skipped"` // already existed (duplicate)
	Zero    int `json:"zero"`    // fee amount was 0, not created
}

// GenerateForMonth creates tuition + transport fees for every active enrollment
// in active class_years whose academic year covers `month` of `academicYearID`,
// scoped to one school. Idempotent: re-running skips fees that already exist.
//
// month is 1-12. dueDate is the 10th of the following month.
func GenerateForMonth(db *gorm.DB, schoolID, academicYearID uint, month int) (*Result, error) {
	res := &Result{}

	// Fetch the academic year (for due-date year calc + tenancy)
	var ay models.AcademicYear
	if err := db.Where("id = ? AND school_id = ?", academicYearID, schoolID).First(&ay).Error; err != nil {
		return nil, err
	}

	// Active class_years in this academic year
	var classYears []models.ClassYear
	if err := db.Where("school_id = ? AND academic_year_id = ? AND is_active = ?",
		schoolID, academicYearID, true).
		Find(&classYears).Error; err != nil {
		return nil, err
	}

	dueDate := dueOn10thNextMonth(month, ay.StartDate)

	err := db.Transaction(func(tx *gorm.DB) error {
		for _, cy := range classYears {
			// Active enrollments in this class_year
			var enrollments []models.Enrollment
			if err := tx.Where("school_id = ? AND class_year_id = ? AND status = ?",
				schoolID, cy.ID, "active").
				Find(&enrollments).Error; err != nil {
				return err
			}

			for _, enr := range enrollments {
				// tuition
				if err := upsertFee(tx, res, schoolID, enr.ID, "tuition", month, cy.TuitionFee, dueDate); err != nil {
					return err
				}
				// transport
				if err := upsertFee(tx, res, schoolID, enr.ID, "transport", month, cy.TransportFee, dueDate); err != nil {
					return err
				}
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return res, nil
}

// upsertFee inserts a fee if it doesn't already exist. Zero-amount fees are skipped.
func upsertFee(tx *gorm.DB, res *Result, schoolID, enrollmentID uint, feeType string, month int, amount decimal.Decimal, dueDate time.Time) error {
	if amount.LessThanOrEqual(decimal.Zero) {
		res.Zero++
		return nil
	}

	fee := models.Fee{
		SchoolID:     schoolID,
		EnrollmentID: enrollmentID,
		FeeType:      feeType,
		Month:        month,
		Amount:       amount,
		DueDate:      dueDate,
		Discount:     decimal.Zero,
		Status:       "unpaid",
	}

	// ON CONFLICT DO NOTHING on (enrollment_id, fee_type, month) — idempotent
	tx2 := tx.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "enrollment_id"}, {Name: "fee_type"}, {Name: "month"}},
		DoNothing: true,
	}).Create(&fee)
	if tx2.Error != nil {
		return tx2.Error
	}
	if tx2.RowsAffected == 0 {
		res.Skipped++ // already existed
	} else {
		res.Created++
	}
	return nil
}

// dueOn10thNextMonth: 10th of the month after `month`. Year derived from the
// academic year's start so Dec rolls into next January correctly.
func dueOn10thNextMonth(month int, yearStart time.Time) time.Time {
	year := yearStart.Year()
	if month < int(yearStart.Month()) {
		year++ // Jan-Mar belong to the next calendar year of an April-start session
	}
	// time.Date normalizes month+1 == 13 into Jan of year+1
	return time.Date(year, time.Month(month+1), 10, 0, 0, 0, 0, time.UTC)
}
