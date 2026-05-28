package handlers

import (
	"errors"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/ishansaini194/lms/api/internal/middleware"
	"github.com/ishansaini194/lms/api/internal/models"
	feegen "github.com/ishansaini194/lms/api/internal/services"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"
)

type FeesHandler struct {
	DB *gorm.DB
}

func NewFeesHandler(db *gorm.DB) *FeesHandler {
	return &FeesHandler{DB: db}
}

// Allowed fee types. Adjustments are handled by editing the amount directly
// (Interpretation A), so there are no *_adjust types.
var validFeeTypes = map[string]bool{
	"tuition":   true,
	"transport": true,
	"admission": true,
	"exam":      true,
	"books":     true,
	"uniform":   true,
	"late_fee":  true,
}

// --- Request structs ---

type CreateFeeRequest struct {
	EnrollmentID   uint       `json:"enrollment_id"`
	FeeType        string     `json:"fee_type"`
	Month          int        `json:"month"`
	Amount         string     `json:"amount"`   // decimal as string, e.g. "800.00"
	Discount       string     `json:"discount"` // optional, defaults to "0"
	DiscountReason *string    `json:"discount_reason,omitempty"`
	DueDate        *time.Time `json:"due_date,omitempty"` // optional; defaults to 10th of next month
}

// Pointer fields = partial update. nil means "leave unchanged".
// fee_type, month, enrollment_id, status are NOT editable.
type UpdateFeeRequest struct {
	Amount         *string    `json:"amount,omitempty"`
	Discount       *string    `json:"discount,omitempty"`
	DiscountReason *string    `json:"discount_reason,omitempty"`
	DueDate        *time.Time `json:"due_date,omitempty"`
}

// GET /api/fees
// Filters: enrollment_id, student_id, class_year_id, academic_year_id,
// fee_type, month, status, overdue. Paginated 20/page (max 100).
func (h *FeesHandler) List(c *fiber.Ctx) error {
	schoolID := middleware.GetSchoolID(c)

	enrollmentID := c.QueryInt("enrollment_id", 0)
	studentID := c.QueryInt("student_id", 0)
	classYearID := c.QueryInt("class_year_id", 0)
	academicYearID := c.QueryInt("academic_year_id", 0)
	feeType := strings.TrimSpace(c.Query("fee_type"))
	month := c.QueryInt("month", 0)
	status := strings.TrimSpace(c.Query("status"))
	overdue, _ := strconv.ParseBool(c.Query("overdue"))

	page := c.QueryInt("page", 1)
	limit := c.QueryInt("limit", 20)
	if limit > 100 {
		limit = 100
	}
	if limit < 1 {
		limit = 20
	}
	if page < 1 {
		page = 1
	}

	// Base query — always tenant-scoped on fees.school_id
	query := h.DB.Model(&models.Fee{}).Where("fees.school_id = ?", schoolID)

	// Direct filters on the fees table
	if enrollmentID > 0 {
		query = query.Where("fees.enrollment_id = ?", enrollmentID)
	}
	if feeType != "" {
		query = query.Where("fees.fee_type = ?", feeType)
	}
	if month > 0 {
		query = query.Where("fees.month = ?", month)
	}
	if status != "" {
		query = query.Where("fees.status = ?", status)
	}
	if overdue {
		query = query.Where("fees.status != ? AND fees.due_date < ?", "paid", time.Now())
	}

	// Filters that require joining through enrollments / class_years.
	// Tenant predicates on the joined tables too — defense in depth, per the
	// "every query is tenant-scoped" principle.
	needEnrollmentJoin := studentID > 0 || classYearID > 0 || academicYearID > 0
	if needEnrollmentJoin {
		query = query.Joins(
			"JOIN enrollments ON enrollments.id = fees.enrollment_id AND enrollments.school_id = ?",
			schoolID,
		)
		if studentID > 0 {
			query = query.Where("enrollments.student_id = ?", studentID)
		}
		if classYearID > 0 {
			query = query.Where("enrollments.class_year_id = ?", classYearID)
		}
		if academicYearID > 0 {
			query = query.Joins(
				"JOIN class_years ON class_years.id = enrollments.class_year_id AND class_years.school_id = ?",
				schoolID,
			).Where("class_years.academic_year_id = ?", academicYearID)
		}
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to count fees"})
	}

	var fees []models.Fee
	offset := (page - 1) * limit
	if err := query.
		Order("fees.due_date ASC, fees.id ASC").
		Limit(limit).
		Offset(offset).
		Find(&fees).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to fetch fees"})
	}

	// Populate computed net_amount on each row
	for i := range fees {
		fees[i].NetAmount = fees[i].Amount.Sub(fees[i].Discount)
	}

	totalPages := int(total) / limit
	if int(total)%limit > 0 {
		totalPages++
	}

	return c.JSON(fiber.Map{
		"data":        fees,
		"total":       total,
		"page":        page,
		"limit":       limit,
		"total_pages": totalPages,
	})
}

// GET /api/fees/:id — single fee with payment history
func (h *FeesHandler) GetOne(c *fiber.Ctx) error {
	schoolID := middleware.GetSchoolID(c)

	id, err := strconv.Atoi(c.Params("id"))
	if err != nil || id <= 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid fee id"})
	}

	var fee models.Fee
	if err := h.DB.
		Where("id = ? AND school_id = ?", id, schoolID).
		Preload("Payments").
		First(&fee).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "fee not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "database error"})
	}

	fee.NetAmount = fee.Amount.Sub(fee.Discount)
	return c.JSON(fee)
}

// POST /api/fees — create a single fee
func (h *FeesHandler) Create(c *fiber.Ctx) error {
	schoolID := middleware.GetSchoolID(c)

	var body CreateFeeRequest
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request"})
	}

	// Required: enrollment_id
	if body.EnrollmentID == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "enrollment_id is required"})
	}

	// fee_type whitelist
	body.FeeType = strings.ToLower(strings.TrimSpace(body.FeeType))
	if !validFeeTypes[body.FeeType] {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid fee_type"})
	}

	// month range
	if body.Month < 1 || body.Month > 12 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "month must be between 1 and 12"})
	}

	// amount
	amount, err := decimal.NewFromString(body.Amount)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid amount"})
	}
	if amount.IsNegative() {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "amount cannot be negative"})
	}

	// discount — defaults to 0 when blank
	discount := decimal.Zero
	if strings.TrimSpace(body.Discount) != "" {
		discount, err = decimal.NewFromString(body.Discount)
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid discount"})
		}
	}
	if discount.IsNegative() {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "discount cannot be negative"})
	}
	if discount.GreaterThan(amount) {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "discount cannot exceed amount"})
	}

	// Cross-tenancy: enrollment must belong to this school. Capture its
	// academic year so we can default the due_date to the correct calendar year.
	var enr models.Enrollment
	if err := h.DB.
		Where("id = ? AND school_id = ?", body.EnrollmentID, schoolID).
		Preload("ClassYear.AcademicYear").
		First(&enr).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "enrollment not found in this school"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "database error"})
	}

	// due_date: use provided, else default to the 10th of the month AFTER `month`.
	var dueDate time.Time
	if body.DueDate != nil {
		dueDate = *body.DueDate
	} else {
		dueDate = defaultDueDate(body.Month, enr.ClassYear.AcademicYear.StartDate)
	}

	// discount_reason — trim, nil if empty
	var reasonPtr *string
	if body.DiscountReason != nil {
		r := strings.TrimSpace(*body.DiscountReason)
		if r != "" {
			reasonPtr = &r
		}
	}

	fee := models.Fee{
		SchoolID:       schoolID,
		EnrollmentID:   body.EnrollmentID,
		FeeType:        body.FeeType,
		Month:          body.Month,
		Amount:         amount,
		DueDate:        dueDate,
		Discount:       discount,
		DiscountReason: reasonPtr,
		Status:         "unpaid", // no payments at creation
	}

	if err := h.DB.Create(&fee).Error; err != nil {
		if isUniqueViolation(err) {
			return c.Status(fiber.StatusConflict).JSON(fiber.Map{
				"error": "a fee of this type already exists for this enrollment and month",
			})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to create fee"})
	}

	fee.NetAmount = fee.Amount.Sub(fee.Discount)
	return c.Status(fiber.StatusCreated).JSON(fee)
}

// PUT /api/fees/:id — edit amount / discount / discount_reason / due_date.
// fee_type, month, enrollment_id, status are immutable here.
func (h *FeesHandler) Update(c *fiber.Ctx) error {
	schoolID := middleware.GetSchoolID(c)

	id, err := strconv.Atoi(c.Params("id"))
	if err != nil || id <= 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid fee id"})
	}

	var body UpdateFeeRequest
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request"})
	}

	err = h.DB.Transaction(func(tx *gorm.DB) error {
		var fee models.Fee
		if err := tx.Where("id = ? AND school_id = ?", id, schoolID).First(&fee).Error; err != nil {
			return err
		}

		// Start from current values; override with any provided fields.
		newAmount := fee.Amount
		newDiscount := fee.Discount

		if body.Amount != nil {
			a, perr := decimal.NewFromString(*body.Amount)
			if perr != nil {
				return &httpError{fiber.StatusBadRequest, "invalid amount"}
			}
			if a.IsNegative() {
				return &httpError{fiber.StatusBadRequest, "amount cannot be negative"}
			}
			newAmount = a
		}

		if body.Discount != nil {
			d, perr := decimal.NewFromString(*body.Discount)
			if perr != nil {
				return &httpError{fiber.StatusBadRequest, "invalid discount"}
			}
			if d.IsNegative() {
				return &httpError{fiber.StatusBadRequest, "discount cannot be negative"}
			}
			newDiscount = d
		}

		// Resulting values must satisfy: discount <= amount (matches schema CHECK)
		if newDiscount.GreaterThan(newAmount) {
			return &httpError{fiber.StatusBadRequest, "discount cannot exceed amount"}
		}

		newNet := newAmount.Sub(newDiscount)

		// Overpayment guard (Option 2): cannot reduce net below money already paid.
		paid, perr := sumCompletedPayments(tx, fee.ID)
		if perr != nil {
			return perr
		}
		if newNet.LessThan(paid) {
			return &httpError{fiber.StatusConflict,
				"cannot reduce fee below amount already paid; reverse the payment first"}
		}

		// Build the update set
		updates := map[string]interface{}{
			"amount":   newAmount,
			"discount": newDiscount,
		}
		if body.DueDate != nil {
			updates["due_date"] = *body.DueDate
		}
		if body.DiscountReason != nil {
			r := strings.TrimSpace(*body.DiscountReason)
			if r == "" {
				updates["discount_reason"] = nil
			} else {
				updates["discount_reason"] = r
			}
		}

		if err := tx.Model(&fee).Updates(updates).Error; err != nil {
			return err
		}

		// Recompute status (amount/discount may have shifted the paid/owed balance)
		newStatus := computeStatus(newNet, paid)
		if err := tx.Model(&fee).Update("status", newStatus).Error; err != nil {
			return err
		}

		return nil
	})

	if err != nil {
		// typed HTTP errors from inside the txn
		var he *httpError
		if errors.As(err, &he) {
			return c.Status(he.status).JSON(fiber.Map{"error": he.msg})
		}
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "fee not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "update failed"})
	}

	// Reload fresh state with payments
	var fee models.Fee
	if err := h.DB.
		Where("id = ? AND school_id = ?", id, schoolID).
		Preload("Payments").
		First(&fee).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "update succeeded but reload failed"})
	}
	fee.NetAmount = fee.Amount.Sub(fee.Discount)
	return c.JSON(fee)
}

// --- Shared helpers ---

// httpError carries an HTTP status out of a transaction closure.
type httpError struct {
	status int
	msg    string
}

func (e *httpError) Error() string { return e.msg }

// sumCompletedPayments returns the total of completed payments against a fee.
func sumCompletedPayments(tx *gorm.DB, feeID uint) (decimal.Decimal, error) {
	var total decimal.Decimal
	row := tx.Model(&models.Payment{}).
		Where("fee_id = ? AND status = ?", feeID, "completed").
		Select("COALESCE(SUM(amount), 0)")
	if err := row.Scan(&total).Error; err != nil {
		return decimal.Zero, err
	}
	return total, nil
}

// computeStatus derives fee status from net owed and amount paid.
// net <= 0 (fully discounted) is treated as paid.
func computeStatus(net, paid decimal.Decimal) string {
	if net.LessThanOrEqual(decimal.Zero) {
		return "paid"
	}
	if paid.GreaterThanOrEqual(net) {
		return "paid"
	}
	if paid.GreaterThan(decimal.Zero) {
		return "partial"
	}
	return "unpaid"
}

// defaultDueDate returns the 10th of the month AFTER the fee's month.
// The calendar year is inferred from the academic year's start date so that
// a December fee correctly rolls into January of the next year.
func defaultDueDate(month int, yearStart time.Time) time.Time {
	year := yearStart.Year()
	// If the fee month is before the academic-year start month, it belongs
	// to the next calendar year (e.g. AY starts April; Jan/Feb/Mar are next year).
	if month < int(yearStart.Month()) {
		year++
	}
	// time.Date normalizes month+1 == 13 into January of year+1 automatically.
	return time.Date(year, time.Month(month+1), 10, 0, 0, 0, 0, time.UTC)
}

// POST /api/fees/generate  body: {"month": 4, "academic_year_id": 1}
// Runs monthly fee generation on demand (testing / catch-up).
func (h *FeesHandler) Generate(c *fiber.Ctx) error {
	schoolID := middleware.GetSchoolID(c)

	var body struct {
		Month          int  `json:"month"`
		AcademicYearID uint `json:"academic_year_id"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request"})
	}
	if body.Month < 1 || body.Month > 12 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "month must be between 1 and 12"})
	}
	if body.AcademicYearID == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "academic_year_id is required"})
	}

	res, err := feegen.GenerateForMonth(h.DB, schoolID, body.AcademicYearID, body.Month)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "academic_year not found in this school"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "generation failed"})
	}
	return c.JSON(res)
}
