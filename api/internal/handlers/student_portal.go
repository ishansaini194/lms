package handlers

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/ishansaini194/lms/api/internal/middleware"
	"github.com/ishansaini194/lms/api/internal/models"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// ── Web Push subscriptions ──────────────────────────────────────────────────
// Body shape mirrors the browser's PushSubscription.toJSON().
type pushSubscriptionRequest struct {
	Endpoint string `json:"endpoint"`
	Keys     struct {
		P256dh string `json:"p256dh"`
		Auth   string `json:"auth"`
	} `json:"keys"`
}

type pushUnsubscribeRequest struct {
	Endpoint string `json:"endpoint"`
}

// POST /api/me/push-subscription
// Saves (upserts) the logged-in student's Web Push subscription. user_id and
// school_id come from the JWT, never the body — a student can only subscribe
// themselves. Upsert on the unique endpoint so re-subscribing the same device
// updates rather than duplicating or 409-failing.
func (h *StudentPortalHandler) SavePushSubscription(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	schoolID := middleware.GetSchoolID(c)
	if userID == 0 || schoolID == 0 {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "not authenticated"})
	}

	var body pushSubscriptionRequest
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request"})
	}
	endpoint := strings.TrimSpace(body.Endpoint)
	p256dh := strings.TrimSpace(body.Keys.P256dh)
	auth := strings.TrimSpace(body.Keys.Auth)
	if endpoint == "" || p256dh == "" || auth == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "endpoint, keys.p256dh and keys.auth are required"})
	}

	sub := models.PushSubscription{
		SchoolID: schoolID,
		UserID:   userID,
		Endpoint: endpoint,
		P256dh:   p256dh,
		Auth:     auth,
	}
	// On endpoint conflict, reassign ownership + refresh keys/updated_at.
	if err := h.DB.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "endpoint"}},
		DoUpdates: clause.AssignmentColumns([]string{"school_id", "user_id", "p256dh", "auth", "updated_at"}),
	}).Create(&sub).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to save subscription"})
	}
	return c.JSON(fiber.Map{"message": "subscription saved"})
}

// DELETE /api/me/push-subscription
// Removes the subscription for a given endpoint (from the body or ?endpoint=),
// scoped to the JWT's user_id so a student can only delete their own. Idempotent
// — returns 200 even if nothing matched.
func (h *StudentPortalHandler) DeletePushSubscription(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	if userID == 0 {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "not authenticated"})
	}

	endpoint := strings.TrimSpace(c.Query("endpoint"))
	if endpoint == "" {
		var body pushUnsubscribeRequest
		if err := c.BodyParser(&body); err == nil {
			endpoint = strings.TrimSpace(body.Endpoint)
		}
	}
	if endpoint == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "endpoint is required"})
	}

	if err := h.DB.
		Where("user_id = ? AND endpoint = ?", userID, endpoint).
		Delete(&models.PushSubscription{}).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to delete subscription"})
	}
	return c.JSON(fiber.Map{"message": "subscription removed"})
}

type StudentPortalHandler struct {
	DB              *gorm.DB
	LibraryBaseDir  string
	HomeworkBaseDir string
}

func NewStudentPortalHandler(db *gorm.DB, libraryBaseDir, homeworkBaseDir string) *StudentPortalHandler {
	return &StudentPortalHandler{DB: db, LibraryBaseDir: libraryBaseDir, HomeworkBaseDir: homeworkBaseDir}
}

// studentID pulls the student_id from the JWT and guards against a missing/zero
// value (which would otherwise silently scope queries to "student 0").
// Returns (0, false) if absent — caller should return 401.
func (h *StudentPortalHandler) studentID(c *fiber.Ctx) (uint, bool) {
	sid := middleware.GetStudentID(c)
	if sid == 0 {
		return 0, false
	}
	return sid, true
}

// activeClassYearIDs returns the class_year IDs the student is currently
// actively enrolled in (status = 'active'). Used to scope notices, homework,
// library to the student's current class(es).
func (h *StudentPortalHandler) activeClassYearIDs(studentID, schoolID uint) ([]uint, error) {
	var ids []uint
	err := h.DB.Model(&models.Enrollment{}).
		Where("school_id = ? AND student_id = ? AND status = ?", schoolID, studentID, "active").
		Pluck("class_year_id", &ids).Error
	return ids, err
}

// allEnrollmentIDs returns every enrollment id for the student (all years).
// Used to scope fees, results, assessment marks (history matters there).
func (h *StudentPortalHandler) allEnrollmentIDs(studentID, schoolID uint) ([]uint, error) {
	var ids []uint
	err := h.DB.Model(&models.Enrollment{}).
		Where("school_id = ? AND student_id = ?", schoolID, studentID).
		Pluck("id", &ids).Error
	return ids, err
}

// GET /api/me/profile — the student's own record
func (h *StudentPortalHandler) Profile(c *fiber.Ctx) error {
	sid, ok := h.studentID(c)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "not a student account"})
	}
	schoolID := middleware.GetSchoolID(c)

	var student models.Student
	if err := h.DB.Where("id = ? AND school_id = ?", sid, schoolID).First(&student).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "student not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "database error"})
	}
	return c.JSON(student)
}

// GET /api/me/enrollments — the student's class history (all years)
func (h *StudentPortalHandler) Enrollments(c *fiber.Ctx) error {
	sid, ok := h.studentID(c)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "not a student account"})
	}
	schoolID := middleware.GetSchoolID(c)

	var enrollments []models.Enrollment
	if err := h.DB.
		Where("school_id = ? AND student_id = ?", schoolID, sid).
		Preload("ClassYear.Class").
		Preload("ClassYear.AcademicYear").
		Order("created_at DESC").
		Find(&enrollments).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to fetch enrollments"})
	}
	return c.JSON(enrollments)
}

// GET /api/me/fees — all the student's fees (all years), with computed net_amount
func (h *StudentPortalHandler) Fees(c *fiber.Ctx) error {
	sid, ok := h.studentID(c)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "not a student account"})
	}
	schoolID := middleware.GetSchoolID(c)

	enrollmentIDs, err := h.allEnrollmentIDs(sid, schoolID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "database error"})
	}
	if len(enrollmentIDs) == 0 {
		return c.JSON([]models.Fee{})
	}

	var fees []models.Fee
	if err := h.DB.
		Where("school_id = ? AND enrollment_id IN ?", schoolID, enrollmentIDs).
		Order("month ASC, id ASC").
		Find(&fees).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to fetch fees"})
	}

	for i := range fees {
		fees[i].NetAmount = fees[i].Amount.Sub(fees[i].Discount)
	}
	return c.JSON(fees)
}

// GET /api/me/fees/:id/payments — payment history for one of the student's fees.
// Verifies the fee belongs to the student before returning any payments.
func (h *StudentPortalHandler) FeePayments(c *fiber.Ctx) error {
	sid, ok := h.studentID(c)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "not a student account"})
	}
	schoolID := middleware.GetSchoolID(c)

	feeID, err := strconv.Atoi(c.Params("id"))
	if err != nil || feeID <= 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid fee id"})
	}

	enrollmentIDs, err := h.allEnrollmentIDs(sid, schoolID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "database error"})
	}
	if len(enrollmentIDs) == 0 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "fee not found"})
	}

	var fee models.Fee
	if err := h.DB.
		Where("id = ? AND school_id = ? AND enrollment_id IN ?", feeID, schoolID, enrollmentIDs).
		First(&fee).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "fee not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "database error"})
	}

	var payments []models.Payment
	if err := h.DB.
		Where("fee_id = ? AND school_id = ?", fee.ID, schoolID).
		Order("paid_at DESC").
		Find(&payments).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to fetch payments"})
	}
	return c.JSON(payments)
}

// GET /api/me/notices — notices visible to the student:
// school-wide notices OR notices targeted at a class_year they're actively enrolled in.
func (h *StudentPortalHandler) Notices(c *fiber.Ctx) error {
	sid, ok := h.studentID(c)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "not a student account"})
	}
	schoolID := middleware.GetSchoolID(c)

	classYearIDs, err := h.activeClassYearIDs(sid, schoolID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "database error"})
	}

	query := h.DB.Model(&models.Notice{}).
		Where("notices.school_id = ? AND notices.is_active = ?", schoolID, true)

	// Single Where call so GORM wraps the OR in parens, preserving the school/active filter above.
	if len(classYearIDs) > 0 {
		query = query.
			Joins("LEFT JOIN notice_targets ON notice_targets.notice_id = notices.id").
			Where("notices.target_all_school = ? OR notice_targets.class_year_id IN ?", true, classYearIDs).
			Group("notices.id")
	} else {
		query = query.Where("notices.target_all_school = ?", true)
	}

	var notices []models.Notice
	if err := query.Order("notices.created_at DESC").Find(&notices).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to fetch notices"})
	}
	return c.JSON(notices)
}

// GET /api/me/homework — homework targeted at a class_year the student is
// actively enrolled in. (Homework has no school-wide flag; always class-targeted.)
func (h *StudentPortalHandler) Homework(c *fiber.Ctx) error {
	sid, ok := h.studentID(c)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "not a student account"})
	}
	schoolID := middleware.GetSchoolID(c)

	classYearIDs, err := h.activeClassYearIDs(sid, schoolID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "database error"})
	}
	if len(classYearIDs) == 0 {
		return c.JSON([]models.Homework{})
	}

	var homeworks []models.Homework
	if err := h.DB.Model(&models.Homework{}).
		Joins("JOIN homework_targets ON homework_targets.homework_id = homeworks.id").
		Where("homeworks.school_id = ? AND homeworks.is_active = ? AND homework_targets.class_year_id IN ?",
			schoolID, true, classYearIDs).
		Group("homeworks.id").
		Order("homeworks.due_date DESC NULLS LAST, homeworks.id DESC").
		Find(&homeworks).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to fetch homework"})
	}

	subjIDs := []uint{}
	seen := map[uint]bool{}
	for _, hw := range homeworks {
		if hw.SubjectID != nil && !seen[*hw.SubjectID] {
			seen[*hw.SubjectID] = true
			subjIDs = append(subjIDs, *hw.SubjectID)
		}
	}
	names := subjectNamesByID(h.DB, schoolID, subjIDs)
	for i := range homeworks {
		if homeworks[i].SubjectID != nil {
			if n, ok := names[*homeworks[i].SubjectID]; ok {
				nm := n
				homeworks[i].SubjectName = &nm
			}
		}
	}

	// Stamp the posting teacher's name so the student sees who set the homework.
	tIDs := []uint{}
	tSeen := map[uint]bool{}
	for _, hw := range homeworks {
		if hw.TeacherID != 0 && !tSeen[hw.TeacherID] {
			tSeen[hw.TeacherID] = true
			tIDs = append(tIDs, hw.TeacherID)
		}
	}
	tNames := teacherNamesByID(h.DB, schoolID, tIDs)
	for i := range homeworks {
		if n, ok := tNames[homeworks[i].TeacherID]; ok {
			nm := n
			homeworks[i].TeacherName = &nm
		}
	}

	// Stamp attachments so the student can see/download attached files.
	hwIDs := make([]uint, len(homeworks))
	for i := range homeworks {
		hwIDs[i] = homeworks[i].ID
	}
	attByHW := attachmentsByHomeworkID(h.DB, schoolID, hwIDs)
	for i := range homeworks {
		homeworks[i].Attachments = attByHW[homeworks[i].ID]
		if homeworks[i].Attachments == nil {
			homeworks[i].Attachments = []models.HomeworkAttachment{}
		}
	}

	return c.JSON(homeworks)
}

// GET /api/me/homework/attachments/:aid/download — stream a homework attachment,
// but only if its homework is targeted at one of the student's active class-years.
func (h *StudentPortalHandler) HomeworkAttachmentDownload(c *fiber.Ctx) error {
	sid, ok := h.studentID(c)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "not a student account"})
	}
	schoolID := middleware.GetSchoolID(c)

	aid, err := strconv.Atoi(c.Params("aid"))
	if err != nil || aid <= 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid attachment id"})
	}

	var att models.HomeworkAttachment
	if err := h.DB.Where("id = ? AND school_id = ?", aid, schoolID).First(&att).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "attachment not found"})
	}

	// Authorize: the parent homework must target a class-year the student is in.
	classYearIDs, err := h.activeClassYearIDs(sid, schoolID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "database error"})
	}
	var match int64
	if len(classYearIDs) > 0 {
		h.DB.Model(&models.HomeworkTarget{}).
			Where("homework_id = ? AND class_year_id IN ?", att.HomeworkID, classYearIDs).
			Count(&match)
	}
	if match == 0 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "attachment not found"})
	}

	return serveAttachment(c, h.HomeworkBaseDir, &att)
}

// GET /api/me/results — the student's exam results (all years), with exam info.
func (h *StudentPortalHandler) Results(c *fiber.Ctx) error {
	sid, ok := h.studentID(c)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "not a student account"})
	}
	schoolID := middleware.GetSchoolID(c)

	enrollmentIDs, err := h.allEnrollmentIDs(sid, schoolID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "database error"})
	}
	if len(enrollmentIDs) == 0 {
		return c.JSON([]models.Result{})
	}

	var results []models.Result
	if err := h.DB.
		Where("school_id = ? AND enrollment_id IN ?", schoolID, enrollmentIDs).
		Preload("Exam").
		Order("id DESC").
		Find(&results).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to fetch results"})
	}
	return c.JSON(results)
}

// GET /api/me/assessment-marks — the student's assessment marks (all years).
func (h *StudentPortalHandler) AssessmentMarks(c *fiber.Ctx) error {
	sid, ok := h.studentID(c)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "not a student account"})
	}
	schoolID := middleware.GetSchoolID(c)

	enrollmentIDs, err := h.allEnrollmentIDs(sid, schoolID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "database error"})
	}
	if len(enrollmentIDs) == 0 {
		return c.JSON([]models.AssessmentMark{})
	}

	var marks []models.AssessmentMark
	if err := h.DB.
		Where("school_id = ? AND enrollment_id IN ?", schoolID, enrollmentIDs).
		Preload("Assessment").
		Order("id DESC").
		Find(&marks).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to fetch assessment marks"})
	}
	return c.JSON(marks)
}

// GET /api/me/library?category=
// Access differs by category:
//   - PYQ: OPEN — any student may see every class's PYQs. The class target is
//     organizational only (buckets PYQs in the picker), never access control.
//   - Notes (and anything else): scoped to the student's ACTIVE class-year
//     targets, like homework.
// Each item carries its target class IDs/labels + subject name for the UI.
func (h *StudentPortalHandler) Library(c *fiber.Ctx) error {
	sid, ok := h.studentID(c)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "not a student account"})
	}
	schoolID := middleware.GetSchoolID(c)
	category := strings.TrimSpace(c.Query("category"))

	// PYQ door: open to all classes, no target scoping.
	if category == "pyq" {
		var files []models.Library
		if err := h.DB.Where("school_id = ? AND category = ?", schoolID, "pyq").
			Order("created_at DESC").
			Find(&files).Error; err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to fetch library files"})
		}
		return c.JSON(enrichLibrary(h.DB, schoolID, files))
	}

	// Notes / default: scoped to the student's active class-year targets.
	classYearIDs, err := h.activeClassYearIDs(sid, schoolID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "database error"})
	}
	if len(classYearIDs) == 0 {
		return c.JSON([]libraryListItem{})
	}

	query := h.DB.Model(&models.Library{}).
		Joins("JOIN library_targets ON library_targets.library_id = library.id").
		Where("library.school_id = ? AND library_targets.class_year_id IN ?", schoolID, classYearIDs).
		Group("library.id")
	if category != "" {
		query = query.Where("library.category = ?", category)
	}

	var files []models.Library
	if err := query.Order("library.created_at DESC").Find(&files).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to fetch library files"})
	}
	return c.JSON(enrichLibrary(h.DB, schoolID, files))
}

// GET /api/me/library/:id/download — stream a library file from the student's school.
func (h *StudentPortalHandler) LibraryDownload(c *fiber.Ctx) error {
	_, ok := h.studentID(c)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "not a student account"})
	}
	schoolID := middleware.GetSchoolID(c)

	id, err := strconv.Atoi(c.Params("id"))
	if err != nil || id <= 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid file id"})
	}

	var lf models.Library
	if err := h.DB.Where("id = ? AND school_id = ?", id, schoolID).First(&lf).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "file not found"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "database error"})
	}

	diskPath := filepath.Join(h.LibraryBaseDir, filepath.FromSlash(lf.FileUrl))
	absBase, _ := filepath.Abs(h.LibraryBaseDir)
	absPath, _ := filepath.Abs(diskPath)
	if !strings.HasPrefix(absPath, absBase) {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid file path"})
	}
	if _, err := os.Stat(absPath); err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "file missing from storage"})
	}

	c.Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s.pdf"`, sanitizeFilename(lf.Title)))
	return c.SendFile(absPath)
}
