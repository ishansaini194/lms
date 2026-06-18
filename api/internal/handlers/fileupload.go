package handlers

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
)

// Shared file-upload storage for every feature that puts files on disk
// (library, notices, homework attachments). Keeping validation, the
// disk-write, the download/serve guard, and filename sanitizing in one place
// means a storage bug is fixed once, not three times.

// maxUploadSize caps a single uploaded file across all upload features.
const maxUploadSize = 25 * 1024 * 1024 // 25 MB

// pngMagic is the 8-byte PNG signature.
var pngMagic = []byte{0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A}

// detectImageOrPDF validates that an uploaded file is a JPEG, PNG, or PDF by both
// its extension AND its leading magic bytes (so a renamed file is rejected). It
// returns the canonical content type and the storage extension to use.
// Used by notices and homework attachments.
func detectImageOrPDF(fh *multipart.FileHeader) (contentType, ext string, err error) {
	name := strings.ToLower(filepath.Ext(fh.Filename))

	src, e := fh.Open()
	if e != nil {
		return "", "", errors.New("failed to read file")
	}
	defer src.Close()

	buf := make([]byte, 8)
	n, _ := io.ReadFull(src, buf)
	buf = buf[:n]

	switch {
	case (name == ".jpg" || name == ".jpeg") && len(buf) >= 3 && buf[0] == 0xFF && buf[1] == 0xD8 && buf[2] == 0xFF:
		return "image/jpeg", ".jpg", nil
	case name == ".png" && len(buf) >= 8 && bytes.Equal(buf[:8], pngMagic):
		return "image/png", ".png", nil
	case name == ".pdf" && len(buf) >= 5 && string(buf[:5]) == "%PDF-":
		return "application/pdf", ".pdf", nil
	}
	return "", "", errors.New("only JPG, PNG, or PDF files are allowed")
}

// detectPDF validates that an uploaded file is a PDF by extension AND magic
// bytes. Used by the library (PDF-only). Returns the storage extension ".pdf".
func detectPDF(fh *multipart.FileHeader) (ext string, err error) {
	if strings.ToLower(filepath.Ext(fh.Filename)) != ".pdf" {
		return "", errors.New("only PDF files are allowed")
	}
	src, e := fh.Open()
	if e != nil {
		return "", errors.New("failed to read file")
	}
	defer src.Close()
	head := make([]byte, 5)
	n, _ := io.ReadFull(src, head)
	if n < 5 || string(head[:5]) != "%PDF-" {
		return "", errors.New("file is not a valid PDF")
	}
	return ".pdf", nil
}

// saveUpload writes fh to {baseDir}/{schoolID}/{uuid}{ext} and returns the
// school-scoped relative URL stored in the DB plus the absolute disk path (so
// the caller can os.Remove it to roll back a failed DB write). The caller is
// responsible for size/type validation first.
func saveUpload(c *fiber.Ctx, baseDir string, schoolID uint, fh *multipart.FileHeader, ext string) (relURL, diskPath string, err error) {
	dir := filepath.Join(baseDir, strconv.Itoa(int(schoolID)))
	if err = os.MkdirAll(dir, 0o755); err != nil {
		return "", "", err
	}
	storedName := uuid.NewString() + ext
	diskPath = filepath.Join(dir, storedName)
	if err = c.SaveFile(fh, diskPath); err != nil {
		return "", "", err
	}
	relURL = filepath.ToSlash(filepath.Join(strconv.Itoa(int(schoolID)), storedName))
	return relURL, diskPath, nil
}

// storedDiskPath resolves a stored relURL back to its on-disk path under baseDir.
func storedDiskPath(baseDir, relURL string) string {
	return filepath.Join(baseDir, filepath.FromSlash(relURL))
}

// serveStoredFile streams a stored file as a download, guarding against path
// traversal (the resolved path must stay under baseDir). contentType is
// optional ("" lets the framework infer it); downloadName sets the
// Content-Disposition filename.
func serveStoredFile(c *fiber.Ctx, baseDir, relURL, contentType, downloadName string) error {
	diskPath := storedDiskPath(baseDir, relURL)
	absBase, _ := filepath.Abs(baseDir)
	absPath, _ := filepath.Abs(diskPath)
	if !strings.HasPrefix(absPath, absBase) {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid file path"})
	}
	if _, err := os.Stat(absPath); err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "file missing from storage"})
	}
	if contentType != "" {
		c.Set("Content-Type", contentType)
	}
	c.Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, downloadName))
	return c.SendFile(absPath)
}

// sanitizeFilename strips characters unsafe for a download filename header
// (quotes that would break the header, and path separators).
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
