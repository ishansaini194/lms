package handlers

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"
)

const DefaultFormat = "${code}/${yy}-${yy_next}/${seq:0000}"

var seqRe = regexp.MustCompile(`\$\{seq:(\d+)\}`)

// PeriodKey returns the counter bucket for a given reset cadence and time.
// yearly -> "25-26" (academic year, April boundary)
// monthly -> "2026-04"
// continuous -> "continuous"
func PeriodKey(reset string, t time.Time) string {
	switch reset {
	case "monthly":
		return t.Format("2006-01")
	case "continuous":
		return "continuous"
	default: // yearly
		y := academicStartYear(t)
		return fmt.Sprintf("%02d-%02d", y%100, (y+1)%100)
	}
}

// academicStartYear: months Jan-Mar belong to the previous April's session.
func academicStartYear(t time.Time) int {
	if int(t.Month()) < 4 {
		return t.Year() - 1
	}
	return t.Year()
}

// Format builds the receipt string from the school's template.
func Format(template, code string, seq int, t time.Time) string {
	if strings.TrimSpace(template) == "" {
		template = DefaultFormat
	}

	startY := academicStartYear(t)
	out := template
	out = strings.ReplaceAll(out, "${code}", code)
	out = strings.ReplaceAll(out, "${yy}", fmt.Sprintf("%02d", startY%100))
	out = strings.ReplaceAll(out, "${yy_next}", fmt.Sprintf("%02d", (startY+1)%100))
	out = strings.ReplaceAll(out, "${yyyy}", strconv.Itoa(t.Year()))
	out = strings.ReplaceAll(out, "${mm}", fmt.Sprintf("%02d", int(t.Month())))

	// ${seq:NNNN} -> zero-padded sequence
	out = seqRe.ReplaceAllStringFunc(out, func(m string) string {
		width := len(seqRe.FindStringSubmatch(m)[1])
		return fmt.Sprintf("%0*d", width, seq)
	})

	return out
}
