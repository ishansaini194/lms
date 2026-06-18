package handlers

import (
	"bytes"
	"errors"
	"io"
	"mime/multipart"
	"path/filepath"
	"strings"
)

// maxAttachmentFileSize caps a single homework attachment. Matches the library
// limit so the storage/UX expectations are consistent across upload features.
const maxAttachmentFileSize = 25 * 1024 * 1024 // 25 MB

// pngMagic is the 8-byte PNG signature.
var pngMagic = []byte{0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A}

// detectImageOrPDF validates that an uploaded file is a JPEG, PNG, or PDF by both
// its extension AND its leading magic bytes (so a renamed file is rejected). It
// returns the canonical content type and the storage extension to use.
//
// Shared by the homework attachment upload; the library upload keeps its own
// stricter PDF-only check. Reads only the first few bytes, then the caller is
// free to re-open/SaveFile the header.
func detectImageOrPDF(fileHeader *multipart.FileHeader) (contentType, ext string, err error) {
	name := strings.ToLower(filepath.Ext(fileHeader.Filename))

	src, e := fileHeader.Open()
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
