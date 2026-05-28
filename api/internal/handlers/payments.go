package handlers

import (
	"errors"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/ishansaini194/lms/api/internal/middleware"
	"github.com/ishansaini194/lms/api/internal/models"
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
		if err := tx.Where("id = ? AND school_id = ?", body.FeeID, schoolID).First(&fee).Error; err != nil {
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
		return tx.Model(&fee).Update("status", newStatus).Error
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
		"data": payments, "total": total, "page": page, "limit": limit, "total_pages": totalPages,
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
		return tx.Model(&fee).Update("status", computeStatus(net, paid)).Error
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
