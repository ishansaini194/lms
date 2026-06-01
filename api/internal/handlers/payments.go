package handlers

import (
	"errors"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/ishansaini194/lms/api/internal/middleware"
	"github.com/ishansaini194/lms/api/internal/models"
	"github.com/ishansaini194/lms/api/internal/services"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var IST = time.FixedZone("IST", 5*3600+1800) // UTC+5:30

type PaymentsHandler struct {
	DB *gorm.DB
}

func NewPaymentsHandler(db *gorm.DB) *PaymentsHandler {
	return &PaymentsHandler{DB: db}
}

var validPaymentModes = map[string]bool{
	"cash": true, "upi": true, "card": true, "cheque": true, "bank_transfer": true,
}

type CreatePaymentRequest struct {
	FeeID       uint    `json:"fee_id"`
	Amount      string  `json:"amount"`
	PaymentMode string  `json:"payment_mode"`
	Notes       *string `json:"notes,omitempty"`
}

type ReversePaymentRequest struct {
	Reason string `json:"reason"`
}

// POST /api/payments
func (h *PaymentsHandler) Create(c *fiber.Ctx) error {
	schoolID := middleware.GetSchoolID(c)

	var body CreatePaymentRequest
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request"})
	}

	if body.FeeID == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "fee_id is required"})
	}

	body.PaymentMode = strings.ToLower(strings.TrimSpace(body.PaymentMode))
	if !validPaymentModes[body.PaymentMode] {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid payment_mode"})
	}

	amount, err := decimal.NewFromString(body.Amount)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid amount"})
	}
	if amount.LessThanOrEqual(decimal.Zero) {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "amount must be greater than zero"})
	}

	var notesPtr *string
	if body.Notes != nil {
		n := strings.TrimSpace(*body.Notes)
		if n != "" {
			notesPtr = &n
		}
	}

	var payment models.Payment
	now := time.Now().In(IST)

	err = h.DB.Transaction(func(tx *gorm.DB) error {
		// Fetch fee (tenant-scoped)
		var fee models.Fee
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("id = ? AND school_id = ?", body.FeeID, schoolID).First(&fee).Error; err != nil {
			return err
		}

		// Overpayment guard: existing completed + this <= net
		paid, perr := sumCompletedPayments(tx, fee.ID)
		if perr != nil {
			return perr
		}
		net := fee.Amount.Sub(fee.Discount)
		if paid.Add(amount).GreaterThan(net) {
			return &httpError{fiber.StatusConflict, "payment exceeds outstanding fee amount"}
		}

		// --- Atomic receipt number ---
		var school models.School
		if err := tx.Where("id = ?", schoolID).First(&school).Error; err != nil {
			return err
		}

		periodKey := PeriodKey(school.ReceiptReset, now)

		// Lock the counter row (create if missing, starting from ReceiptStartingNum-1)
		counter := models.ReceiptCounter{
			SchoolID:   schoolID,
			PeriodKey:  periodKey,
			LastNumber: school.ReceiptStartingNum - 1,
		}
		if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&counter).Error; err != nil {
			return err
		}
		// Re-read with row lock
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("school_id = ? AND period_key = ?", schoolID, periodKey).
			First(&counter).Error; err != nil {
			return err
		}

		nextSeq := counter.LastNumber + 1
		receiptNo := Format(school.ReceiptFormat, school.Code, nextSeq, now)

		if err := tx.Model(&models.ReceiptCounter{}).
			Where("school_id = ? AND period_key = ?", schoolID, periodKey).
			Update("last_number", nextSeq).Error; err != nil {
			return err
		}

		// Create payment
		payment = models.Payment{
			SchoolID:    schoolID,
			FeeID:       fee.ID,
			ReceiptNo:   receiptNo,
			Amount:      amount,
			PaymentMode: body.PaymentMode,
			PaidAt:      now,
			Status:      "completed",
			Notes:       notesPtr,
		}
		if err := tx.Create(&payment).Error; err != nil {
			return err
		}

		// Recompute fee status
		newStatus := computeStatus(net, paid.Add(amount))
		if err := tx.Model(&fee).Update("status", newStatus).Error; err != nil {
			return err
		}

		ev := auditCtx(c)
		ev.Action = "create"
		ev.EntityType = "payment"
		ev.EntityID = payment.ID
		ev.After = map[string]interface{}{
			"receipt_no": payment.ReceiptNo,
			"amount":     payment.Amount.String(),
			"fee_id":     payment.FeeID,
			"fee_status": newStatus,
		}
		return services.Log(tx, ev)
	})

	if err != nil {
		var he *httpError
		if errors.As(err, &he) {
			return c.Status(he.status).JSON(fiber.Map{"error": he.msg})
		}
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "fee not found"})
		}
		if isUniqueViolation(err) {
			return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "receipt number collision, retry"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to record payment"})
	}

	return c.Status(fiber.StatusCreated).JSON(payment)
}

// paymentListItem enriches a Payment with human-readable context (student name,
// fee type, month) for the Recent tab and student history. The embedded Payment
// flattens into the same JSON object.
type paymentListItem struct {
	models.Payment
	StudentName string `json:"student_name"`
	StudentID   uint   `json:"student_id"`
	FeeType     string `json:"fee_type"`
	Month       int    `json:"month"`
}

// enrichPayments maps each payment's fee_id → {student, fee_type, month} via one
// batched join (no N+1). Order is preserved.
func (h *PaymentsHandler) enrichPayments(schoolID uint, payments []models.Payment) []paymentListItem {
	items := make([]paymentListItem, len(payments))
	for i := range payments {
		items[i] = paymentListItem{Payment: payments[i]}
	}
	if len(payments) == 0 {
		return items
	}

	feeIDs := make([]uint, len(payments))
	for i := range payments {
		feeIDs[i] = payments[i].FeeID
	}

	type feeRow struct {
		FeeID       uint
		FeeType     string
		Month       int
		StudentID   uint
		StudentName string
	}
	var rows []feeRow
	h.DB.Table("fees").
		Select("fees.id as fee_id, fees.fee_type, fees.month, students.id as student_id, students.name as student_name").
		Joins("JOIN enrollments ON enrollments.id = fees.enrollment_id").
		Joins("JOIN students ON students.id = enrollments.student_id").
		Where("fees.school_id = ? AND fees.id IN ?", schoolID, feeIDs).
		Scan(&rows)

	byFee := map[uint]feeRow{}
	for _, r := range rows {
		byFee[r.FeeID] = r
	}
	for i := range items {
		if r, ok := byFee[items[i].FeeID]; ok {
			items[i].StudentName = r.StudentName
			items[i].StudentID = r.StudentID
			items[i].FeeType = r.FeeType
			items[i].Month = r.Month
		}
	}
	return items
}

// GET /api/payments?fee_id=&student_id=&from=&to=  (paginated)
func (h *PaymentsHandler) List(c *fiber.Ctx) error {
	schoolID := middleware.GetSchoolID(c)

	feeID := c.QueryInt("fee_id", 0)
	studentID := c.QueryInt("student_id", 0)
	status := strings.TrimSpace(c.Query("status"))

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

	query := h.DB.Model(&models.Payment{}).Where("payments.school_id = ?", schoolID)

	if feeID > 0 {
		query = query.Where("payments.fee_id = ?", feeID)
	}
	if status != "" {
		query = query.Where("payments.status = ?", status)
	}
	if studentID > 0 {
		query = query.
			Joins("JOIN fees ON fees.id = payments.fee_id AND fees.school_id = ?", schoolID).
			Joins("JOIN enrollments ON enrollments.id = fees.enrollment_id AND enrollments.school_id = ?", schoolID).
			Where("enrollments.student_id = ?", studentID)
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to count payments"})
	}

	var payments []models.Payment
	offset := (page - 1) * limit
	if err := query.
		Order("payments.paid_at DESC, payments.id DESC").
		Limit(limit).Offset(offset).
		Find(&payments).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to fetch payments"})
	}

	totalPages := int(total) / limit
	if int(total)%limit > 0 {
		totalPages++
	}

	return c.JSON(fiber.Map{
		"data": h.enrichPayments(schoolID, payments), "total": total, "page": page, "limit": limit, "total_pages": totalPages,
	})
}

// POST /api/payments/:id/reverse
func (h *PaymentsHandler) Reverse(c *fiber.Ctx) error {
	schoolID := middleware.GetSchoolID(c)

	id, err := strconv.Atoi(c.Params("id"))
	if err != nil || id <= 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid payment id"})
	}

	var body ReversePaymentRequest
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request"})
	}
	body.Reason = strings.TrimSpace(body.Reason)
	if body.Reason == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "reason is required"})
	}

	err = h.DB.Transaction(func(tx *gorm.DB) error {
		var payment models.Payment
		if err := tx.Where("id = ? AND school_id = ?", id, schoolID).First(&payment).Error; err != nil {
			return err
		}
		if payment.Status != "completed" {
			return &httpError{fiber.StatusConflict, "only completed payments can be reversed"}
		}

		beforeStatus := payment.Status

		now := time.Now().In(IST)
		if err := tx.Model(&payment).Updates(map[string]interface{}{
			"status":          "reversed",
			"reversed_at":     now,
			"reversal_reason": body.Reason,
		}).Error; err != nil {
			return err
		}

		// Recompute fee status with the reversed payment now excluded
		var fee models.Fee
		if err := tx.Where("id = ? AND school_id = ?", payment.FeeID, schoolID).First(&fee).Error; err != nil {
			return err
		}
		paid, perr := sumCompletedPayments(tx, fee.ID)
		if perr != nil {
			return perr
		}
		net := fee.Amount.Sub(fee.Discount)
		newStatus := computeStatus(net, paid)
		if err := tx.Model(&fee).Update("status", newStatus).Error; err != nil {
			return err
		}

		ev := auditCtx(c)
		ev.Action = "reverse"
		ev.EntityType = "payment"
		ev.EntityID = payment.ID
		ev.Reason = body.Reason
		ev.Before = map[string]interface{}{"status": beforeStatus}
		ev.After = map[string]interface{}{
			"status":     "reversed",
			"fee_status": newStatus,
		}
		return services.Log(tx, ev)
	})

	if err != nil {
		var he *httpError
		if errors.As(err, &he) {
			return c.Status(he.status).JSON(fiber.Map{"error": he.msg})
		}
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "payment not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "reversal failed"})
	}

	return c.JSON(fiber.Map{"message": "payment reversed"})
}
