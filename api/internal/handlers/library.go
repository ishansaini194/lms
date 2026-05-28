package handlers

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/ishansaini194/lms/api/internal/middleware"
	"github.com/ishansaini194/lms/api/internal/models"
	"gorm.io/gorm"
)

type LibraryHandler struct {
	DB      *gorm.DB
	BaseDir string // e.g. "uploads/library" — set at construction
}

func NewLibraryHandler(db *gorm.DB, baseDir string) *LibraryHandler {
	return &LibraryHandler{DB: db, BaseDir: baseDir}
}

const maxLibraryFileSize = 25 * 1024 * 1024 // 25 MB

var validLibraryCategories = map[string]bool{
	"syllabus": true, "notes": true, "datesheet": true, "circular": true, "other": true,
}

// GET /api/library?category=&subject=&class_number=&academic_year_id=
func (h *LibraryHandler) List(c *fiber.Ctx) error {
	schoolID := middleware.GetSchoolID(c)
	category := strings.TrimSpace(c.Query("category"))
	subject := strings.TrimSpace(c.Query("subject"))
	classNumber := c.QueryInt("class_number", 0)
	academicYearID := c.QueryInt("academic_year_id", 0)

	query := h.DB.Model(&models.Library{}).Where("school_id = ?", schoolID)
	if category != "" {
		query = query.Where("category = ?", category)
	}
	if subject != "" {
		query = query.Where("subject = ?", subject)
	}
	if classNumber > 0 {
		query = query.Where("class_number = ?", classNumber)
	}
	if academicYearID > 0 {
		query = query.Where("academic_year_id = ?", academicYearID)
	}

	var files []models.Library
	if err := query.Order("created_at DESC").Find(&files).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to fetch library files"})
	}
	return c.JSON(files)
}

// POST /api/library  (multipart/form-data)
// fields: file (PDF), title, category, subject?, class_number?, academic_year_id?, description?
func (h *LibraryHandler) Upload(c *fiber.Ctx) error {
	schoolID := middleware.GetSchoolID(c)
	userID := middleware.GetUserID(c)

	title := strings.TrimSpace(c.FormValue("title"))
	category := strings.ToLower(strings.TrimSpace(c.FormValue("category")))
	subject := strings.TrimSpace(c.FormValue("subject"))
	description := strings.TrimSpace(c.FormValue("description"))
	classNumber, _ := strconv.Atoi(c.FormValue("class_number"))
	academicYearID, _ := strconv.Atoi(c.FormValue("academic_year_id"))

	if title == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "title is required"})
	}
	if !validLibraryCategories[category] {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid category"})
	}

	// academic_year is required and must belong to school
	if academicYearID <= 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "academic_year_id is required"})
	}
	var ayCnt int64
	if err := h.DB.Model(&models.AcademicYear{}).
		Where("id = ? AND school_id = ?", academicYearID, schoolID).
		Count(&ayCnt).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "database error"})
	}
	if ayCnt == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "academic_year not found in this school"})
	}

	fileHeader, err := c.FormFile("file")
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "file is required"})
	}
	if fileHeader.Size > maxLibraryFileSize {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "file exceeds 25MB limit"})
	}

	// Validate it's actually a PDF: extension + content-type + magic bytes
	if strings.ToLower(filepath.Ext(fileHeader.Filename)) != ".pdf" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "only PDF files are allowed"})
	}
	src, err := fileHeader.Open()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to read file"})
	}
	header := make([]byte, 5)
	n, _ := src.Read(header)
	src.Close()
	if n < 5 || string(header[:5]) != "%PDF-" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "file is not a valid PDF"})
	}

	// Build storage path: {BaseDir}/{school_id}/{uuid}.pdf
	dir := filepath.Join(h.BaseDir, strconv.Itoa(int(schoolID)))
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to prepare storage"})
	}
	storedName := uuid.NewString() + ".pdf"
	diskPath := filepath.Join(dir, storedName)

	if err := c.SaveFile(fileHeader, diskPath); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to save file"})
	}

	// file_url is a relative ref we resolve in Download — not a raw disk path exposed to clients
	relURL := filepath.ToSlash(filepath.Join(strconv.Itoa(int(schoolID)), storedName))

	var subjectPtr, descPtr *string
	if subject != "" {
		subjectPtr = &subject
	}
	if description != "" {
		descPtr = &description
	}
	var classNumberPtr *int
	if classNumber > 0 {
		classNumberPtr = &classNumber
	}

	lf := models.Library{
		SchoolID:       schoolID,
		UploadedByID:   userID,
		AcademicYearID: uint(academicYearID),
		Category:       category,
		Subject:        subjectPtr,
		ClassNumber:    classNumberPtr,
		Title:          title,
		Description:    descPtr,
		FileUrl:        relURL,
		FileSize:       fileHeader.Size,
	}
	if err := h.DB.Create(&lf).Error; err != nil {
		// roll back the file on DB failure
		_ = os.Remove(diskPath)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to record file"})
	}

	return c.Status(fiber.StatusCreated).JSON(lf)
}

// GET /api/library/:id/download — streams the file
func (h *LibraryHandler) Download(c *fiber.Ctx) error {
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

	diskPath := filepath.Join(h.BaseDir, filepath.FromSlash(lf.FileUrl))
	// Safety: ensure resolved path stays under BaseDir
	absBase, _ := filepath.Abs(h.BaseDir)
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

// DELETE /api/library/:id  (hard delete + remove from disk)
func (h *LibraryHandler) Delete(c *fiber.Ctx) error {
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

	// Delete DB row first; if that succeeds, remove the disk file.
	if err := h.DB.Delete(&lf).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to delete file record"})
	}
	diskPath := filepath.Join(h.BaseDir, filepath.FromSlash(lf.FileUrl))
	_ = os.Remove(diskPath) // best-effort; row is already gone

	return c.JSON(fiber.Map{"message": "file deleted"})
}

// sanitizeFilename strips characters unsafe for a download filename header.
func sanitizeFilename(s string) string {
	s = strings.ReplaceAll(s, `"`, "")
	s = strings.ReplaceAll(s, "/", "-")
	s = strings.ReplaceAll(s, "\\", "-")
	s = strings.TrimSpace(s)
	if s == "" {
		return "file"
	}
	return s
}
