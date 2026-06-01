package handlers

import (
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/ishansaini194/lms/api/internal/middleware"
	"github.com/ishansaini194/lms/api/internal/models"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"
)

type DashboardHandler struct {
	DB *gorm.DB
}

func NewDashboardHandler(db *gorm.DB) *DashboardHandler {
	return &DashboardHandler{DB: db}
}

type pendingFeesStat struct {
	Count int64           `json:"count"`
	Total decimal.Decimal `json:"total"`
}

type recentPaymentStat struct {
	ReceiptNo   string          `json:"receipt_no"`
	Amount      decimal.Decimal `json:"amount"`
	PaymentMode string          `json:"payment_mode"`
	PaidAt      time.Time       `json:"paid_at"`
	StudentID   uint            `json:"student_id"`
	StudentName string          `json:"student_name"`
	FeeType     string          `json:"fee_type"`
	Month       int             `json:"month"`
}

type topDefaulterStat struct {
	StudentID   uint            `json:"student_id"`
	StudentName string          `json:"student_name"`
	ClassLabel  string          `json:"class_label"`
	Outstanding decimal.Decimal `json:"outstanding"`
}

// GET /api/dashboard/stats — admin dashboard aggregates in one call.
func (h *DashboardHandler) Stats(c *fiber.Ctx) error {
	schoolID := middleware.GetSchoolID(c)

	// total_students
	var totalStudents int64
	if err := h.DB.Model(&models.Student{}).
		Where("school_id = ? AND is_active = ?", schoolID, true).
		Count(&totalStudents).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to count students"})
	}

	// active_classes
	var activeClasses int64
	if err := h.DB.Model(&models.Class{}).
		Where("school_id = ? AND is_active = ?", schoolID, true).
		Count(&activeClasses).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to count classes"})
	}

	// current_academic_year
	var currentYear string
	h.DB.Model(&models.AcademicYear{}).
		Where("school_id = ? AND is_current = ?", schoolID, true).
		Limit(1).
		Pluck("year_label", &currentYear)

	// pending_fees — count of non-paid fees, and total outstanding balance
	// (SUM(amount - discount) over pending fees) − (SUM of completed payments on those fees).
	var pending pendingFeesStat
	if err := h.DB.Model(&models.Fee{}).
		Where("school_id = ? AND status != ?", schoolID, "paid").
		Count(&pending.Count).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to count pending fees"})
	}
	var pendingGross decimal.Decimal
	h.DB.Model(&models.Fee{}).
		Where("school_id = ? AND status != ?", schoolID, "paid").
		Select("COALESCE(SUM(amount - discount), 0)").
		Scan(&pendingGross)
	var paidOnPending decimal.Decimal
	h.DB.Model(&models.Payment{}).
		Joins("JOIN fees ON fees.id = payments.fee_id").
		Where("payments.school_id = ? AND payments.status = ? AND fees.status != ?", schoolID, "completed", "paid").
		Select("COALESCE(SUM(payments.amount), 0)").
		Scan(&paidOnPending)
	pending.Total = pendingGross.Sub(paidOnPending)

	// collected_this_month — SUM of completed payments since the 1st of the current month (IST).
	now := time.Now().In(IST)
	monthStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, IST)
	var collectedThisMonth decimal.Decimal
	h.DB.Model(&models.Payment{}).
		Where("school_id = ? AND status = ? AND paid_at >= ?", schoolID, "completed", monthStart).
		Select("COALESCE(SUM(amount), 0)").
		Scan(&collectedThisMonth)

	// recent_payments — last 6 completed payments with student/fee context.
	recentPayments := []recentPaymentStat{}
	h.DB.Table("payments").
		Select("payments.receipt_no, payments.amount, payments.payment_mode, payments.paid_at, "+
			"students.id AS student_id, students.name AS student_name, fees.fee_type, fees.month").
		Joins("JOIN fees ON fees.id = payments.fee_id").
		Joins("JOIN enrollments ON enrollments.id = fees.enrollment_id").
		Joins("JOIN students ON students.id = enrollments.student_id").
		Where("payments.school_id = ? AND payments.status = ?", schoolID, "completed").
		Order("payments.paid_at DESC, payments.id DESC").
		Limit(6).
		Scan(&recentPayments)

	// top_defaulters — top 5 students by outstanding balance over their non-paid fees.
	topDefaulters := []topDefaulterStat{}
	h.DB.Table("fees").
		Select("students.id AS student_id, students.name AS student_name, "+
			"SUM((fees.amount - fees.discount) - COALESCE(paid.total, 0)) AS outstanding").
		Joins("JOIN enrollments ON enrollments.id = fees.enrollment_id").
		Joins("JOIN students ON students.id = enrollments.student_id").
		Joins("LEFT JOIN (?) AS paid ON paid.fee_id = fees.id",
			h.DB.Table("payments").
				Select("fee_id, SUM(amount) AS total").
				Where("status = ?", "completed").
				Group("fee_id")).
		Where("fees.school_id = ? AND fees.status != ?", schoolID, "paid").
		Group("students.id, students.name").
		Having("SUM((fees.amount - fees.discount) - COALESCE(paid.total, 0)) > 0").
		Order("outstanding DESC").
		Limit(5).
		Scan(&topDefaulters)

	// Attach a class label (active enrollment → class_year → class) to each defaulter.
	if len(topDefaulters) > 0 {
		ids := make([]uint, len(topDefaulters))
		for i, d := range topDefaulters {
			ids[i] = d.StudentID
		}
		type classRow struct {
			StudentID uint
			Name      string
			Section   string
		}
		var classRows []classRow
		h.DB.Table("enrollments").
			Select("enrollments.student_id, classes.name, classes.section").
			Joins("JOIN class_years ON class_years.id = enrollments.class_year_id").
			Joins("JOIN classes ON classes.id = class_years.class_id").
			Where("enrollments.school_id = ? AND enrollments.student_id IN ? AND enrollments.status = ?",
				schoolID, ids, "active").
			Scan(&classRows)
		labelByStudent := map[uint]string{}
		for _, r := range classRows {
			label := r.Name
			if r.Section != "" {
				label += "-" + r.Section
			}
			labelByStudent[r.StudentID] = label
		}
		for i := range topDefaulters {
			topDefaulters[i].ClassLabel = labelByStudent[topDefaulters[i].StudentID]
		}
	}

	return c.JSON(fiber.Map{
		"total_students":        totalStudents,
		"active_classes":        activeClasses,
		"current_academic_year": currentYear,
		"pending_fees":          pending,
		"collected_this_month":  collectedThisMonth,
		"recent_payments":       recentPayments,
		"top_defaulters":        topDefaulters,
	})
}
