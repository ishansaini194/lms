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
	"notes": true, "pyq": true,
}

// libraryResponse bundles a file with its target class_year IDs (single-item
// responses: Upload, GetOne). Mirrors homeworkResponse.
type libraryResponse struct {
	models.Library
	ClassYearIDs []uint `json:"class_year_ids"`
}

// libraryListItem enriches a file with the uploader's display name and its
// target class_year IDs + labels for the browse view. Mirrors homeworkListItem.
type libraryListItem struct {
	models.Library
	UploadedByName string   `json:"uploaded_by_name"`
	ClassYearIDs   []uint   `json:"class_year_ids"`
	ClassLabels    []string `json:"class_labels"` // ["1-A", "2-A"]
}

// enrichLibrary attaches uploader names + target class_year IDs/labels via
// batched queries (no N+1). Order preserved; slices non-nil so JSON is [] not
// null. Package-level so the student portal handler can share it.
func enrichLibrary(db *gorm.DB, schoolID uint, files []models.Library) []libraryListItem {
	items := make([]libraryListItem, len(files))
	idxByFile := make(map[uint]int, len(files))
	for i := range files {
		items[i] = libraryListItem{Library: files[i], UploadedByName: "Staff", ClassYearIDs: []uint{}, ClassLabels: []string{}}
		idxByFile[files[i].ID] = i
	}
	if len(files) == 0 {
		return items
	}

	fileIDs := make([]uint, len(files))
	userIDSet := map[uint]bool{}
	userIDs := []uint{}
	for i, f := range files {
		fileIDs[i] = f.ID
		if !userIDSet[f.UploadedByID] {
			userIDSet[f.UploadedByID] = true
			userIDs = append(userIDs, f.UploadedByID)
		}
	}

	// Uploader names: display_name, falling back to username.
	type uRow struct {
		ID          uint
		Username    string
		DisplayName *string
	}
	var uRows []uRow
	db.Table("users").
		Select("id, username, display_name").
		Where("school_id = ? AND id IN ?", schoolID, userIDs).
		Scan(&uRows)
	nameByUser := map[uint]string{}
	for _, u := range uRows {
		if u.DisplayName != nil && *u.DisplayName != "" {
			nameByUser[u.ID] = *u.DisplayName
		} else {
			nameByUser[u.ID] = u.Username
		}
	}
	for i := range items {
		if name, ok := nameByUser[items[i].UploadedByID]; ok {
			items[i].UploadedByName = name
		}
	}

	// Target (library_id, class_year_id) pairs, ordered for stable chips.
	type targetRow struct {
		LibraryID   uint
		ClassYearID uint
	}
	var targets []targetRow
	db.Table("library_targets").
		Select("library_id, class_year_id").
		Where("library_id IN ?", fileIDs).
		Order("class_year_id ASC").
		Scan(&targets)

	// class_year → label for the distinct target set.
	cySet := map[uint]bool{}
	for _, t := range targets {
		cySet[t.ClassYearID] = true
	}
	labelByCY := map[uint]string{}
	if len(cySet) > 0 {
		cyIDs := make([]uint, 0, len(cySet))
		for id := range cySet {
			cyIDs = append(cyIDs, id)
		}
		type clRow struct {
			ID      uint
			Name    string
			Section string
		}
		var rows []clRow
		db.Table("class_years").
			Select("class_years.id, classes.name, classes.section").
			Joins("JOIN classes ON classes.id = class_years.class_id").
			Where("class_years.school_id = ? AND class_years.id IN ?", schoolID, cyIDs).
			Scan(&rows)
		for _, r := range rows {
			label := r.Name
			if r.Section != "" {
				label += "-" + r.Section
			}
			labelByCY[r.ID] = label
		}
	}

	for _, t := range targets {
		i, ok := idxByFile[t.LibraryID]
		if !ok {
			continue
		}
		items[i].ClassYearIDs = append(items[i].ClassYearIDs, t.ClassYearID)
		if label, ok := labelByCY[t.ClassYearID]; ok {
			items[i].ClassLabels = append(items[i].ClassLabels, label)
		}
	}

	// Subject names for files that have a subject.
	subjIDs := []uint{}
	subjSeen := map[uint]bool{}
	for _, f := range files {
		if f.SubjectID != nil && !subjSeen[*f.SubjectID] {
			subjSeen[*f.SubjectID] = true
			subjIDs = append(subjIDs, *f.SubjectID)
		}
	}
	subjNames := subjectNamesByID(db, schoolID, subjIDs)
	for i := range items {
		if items[i].SubjectID != nil {
			if name, ok := subjNames[*items[i].SubjectID]; ok {
				n := name
				items[i].SubjectName = &n
			}
		}
	}
	return items
}

// GET /api/library?category=&subject_id=&class_year_id=
// Teachers see only files they uploaded (matches homework read scoping).
func (h *LibraryHandler) List(c *fiber.Ctx) error {
	schoolID := middleware.GetSchoolID(c)
	category := strings.TrimSpace(c.Query("category"))
	subjectID := c.QueryInt("subject_id", 0)
	classYearID := c.QueryInt("class_year_id", 0)

	query := h.DB.Model(&models.Library{}).Where("library.school_id = ?", schoolID)
	if category != "" {
		query = query.Where("library.category = ?", category)
	}
	if subjectID > 0 {
		query = query.Where("library.subject_id = ?", subjectID)
	}
	if isTeacher(c) {
		query = query.Where("library.uploaded_by_id = ?", middleware.GetUserID(c))
	}
	if classYearID > 0 {
		query = query.
			Joins("JOIN library_targets ON library_targets.library_id = library.id").
			Where("library_targets.class_year_id = ?", classYearID).
			Group("library.id")
	}

	var files []models.Library
	if err := query.Order("library.created_at DESC").Find(&files).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to fetch library files"})
	}
	return c.JSON(enrichLibrary(h.DB, schoolID, files))
}

// GET /api/library/:id — file + its target class_year IDs. Teacher ownership → 404.
func (h *LibraryHandler) GetOne(c *fiber.Ctx) error {
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
	if isTeacher(c) && lf.UploadedByID != middleware.GetUserID(c) {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "file not found"})
	}

	var ids []uint
	if err := h.DB.Model(&models.LibraryTarget{}).
		Where("library_id = ?", lf.ID).
		Pluck("class_year_id", &ids).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to fetch targets"})
	}
	if lf.SubjectID != nil {
		if name, ok := subjectNamesByID(h.DB, schoolID, []uint{*lf.SubjectID})[*lf.SubjectID]; ok {
			lf.SubjectName = &name
		}
	}
	return c.JSON(libraryResponse{Library: lf, ClassYearIDs: ids})
}

// POST /api/library  (multipart/form-data)
// fields: file (PDF), title, category (notes|pyq), subject?, class_year_ids (repeated).
func (h *LibraryHandler) Upload(c *fiber.Ctx) error {
	schoolID := middleware.GetSchoolID(c)
	userID := middleware.GetUserID(c)

	title := strings.TrimSpace(c.FormValue("title"))
	category := strings.ToLower(strings.TrimSpace(c.FormValue("category")))
	subjectID, _ := strconv.Atoi(c.FormValue("subject_id"))

	if title == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "title is required"})
	}
	if !validLibraryCategories[category] {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid category"})
	}
	// Subject is optional; when given it must belong to this school.
	var subjectIDPtr *uint
	if subjectID > 0 {
		if !subjectExistsInSchool(h.DB, uint(subjectID), schoolID) {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "subject not found in this school"})
		}
		v := uint(subjectID)
		subjectIDPtr = &v
	}

	// Targets: repeated class_year_ids form fields. Parse + require ≥1 before we
	// touch disk (cheap rejection, no orphan file).
	classYearIDs, perr := parseFormUintSlice(c, "class_year_ids")
	if perr != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid class_year_ids"})
	}
	if len(classYearIDs) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "at least one class_year_id is required"})
	}

	fileHeader, err := c.FormFile("file")
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "file is required"})
	}
	if fileHeader.Size > maxLibraryFileSize {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "file exceeds 25MB limit"})
	}

	// Validate it's actually a PDF: extension + magic bytes
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

	// file_url is a relative ref we resolve in Download — not a raw disk path.
	relURL := filepath.ToSlash(filepath.Join(strconv.Itoa(int(schoolID)), storedName))

	lf := models.Library{
		SchoolID:     schoolID,
		UploadedByID: userID,
		Category:     category,
		SubjectID:    subjectIDPtr,
		Title:        title,
		FileUrl:      relURL,
		FileSize:     fileHeader.Size,
	}

	// Row + targets in one transaction; roll the file back on any failure.
	err = h.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&lf).Error; err != nil {
			return err
		}
		return h.validateAndInsertTargets(tx, schoolID, lf.ID, classYearIDs)
	})
	if err != nil {
		_ = os.Remove(diskPath)
		var he *httpError
		if errors.As(err, &he) {
			return c.Status(he.status).JSON(fiber.Map{"error": he.msg})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to record file"})
	}

	return c.Status(fiber.StatusCreated).JSON(libraryResponse{Library: lf, ClassYearIDs: classYearIDs})
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

// DELETE /api/library/:id  (hard delete + remove from disk; targets cascade)
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

	// A teacher may delete only files she uploaded; admin may delete any.
	// 404 (not 403) — don't reveal another teacher's file exists.
	if isTeacher(c) && lf.UploadedByID != middleware.GetUserID(c) {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "file not found"})
	}

	// Delete DB row first (targets cascade via FK); if that succeeds, remove the file.
	if err := h.DB.Delete(&lf).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to delete file record"})
	}
	diskPath := filepath.Join(h.BaseDir, filepath.FromSlash(lf.FileUrl))
	_ = os.Remove(diskPath) // best-effort; row is already gone

	return c.JSON(fiber.Map{"message": "file deleted"})
}

// validateAndInsertTargets verifies each class_year belongs to the school, then
// bulk-inserts library_targets. Mirrors the homework handler's helper.
//
// TODO(authz): like homework, this only checks the class_year is in the school,
// not that the teacher teaches/owns it — the UI picker is the practical guard.
func (h *LibraryHandler) validateAndInsertTargets(tx *gorm.DB, schoolID, libraryID uint, classYearIDs []uint) error {
	seen := map[uint]bool{}
	unique := make([]uint, 0, len(classYearIDs))
	for _, id := range classYearIDs {
		if id == 0 {
			return &httpError{fiber.StatusBadRequest, "invalid class_year_id"}
		}
		if !seen[id] {
			seen[id] = true
			unique = append(unique, id)
		}
	}

	var count int64
	if err := tx.Model(&models.ClassYear{}).
		Where("school_id = ? AND id IN ?", schoolID, unique).
		Count(&count).Error; err != nil {
		return err
	}
	if int(count) != len(unique) {
		return &httpError{fiber.StatusBadRequest, "one or more class_year_ids not found in this school"}
	}

	targets := make([]models.LibraryTarget, 0, len(unique))
	for _, id := range unique {
		targets = append(targets, models.LibraryTarget{LibraryID: libraryID, ClassYearID: id})
	}
	return tx.Create(&targets).Error
}

// parseFormUintSlice reads a repeated multipart form field (e.g.
// class_year_ids=1&class_year_ids=2) into a []uint. Missing field → empty slice.
func parseFormUintSlice(c *fiber.Ctx, field string) ([]uint, error) {
	form, err := c.MultipartForm()
	if err != nil {
		return nil, err
	}
	vals := form.Value[field]
	out := make([]uint, 0, len(vals))
	for _, v := range vals {
		v = strings.TrimSpace(v)
		if v == "" {
			continue
		}
		n, perr := strconv.ParseUint(v, 10, 64)
		if perr != nil {
			return nil, perr
		}
		out = append(out, uint(n))
	}
	return out, nil
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
