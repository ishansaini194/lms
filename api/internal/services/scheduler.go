package feegen

import (
	"log/slog"
	"time"

	"github.com/ishansaini194/lms/api/internal/models"
	"gorm.io/gorm"
)

// StartScheduler launches a goroutine that checks daily and, on the 1st of the
// month, generates fees for every school's current academic year.
// In-process; acceptable up to ~10K students per the ops plan.
func StartScheduler(db *gorm.DB) {
	go func() {
		for {
			now := time.Now().In(ist())
			if now.Day() == 1 {
				runForAllSchools(db, now)
			}
			// Sleep until the next day's 00:05 IST
			next := time.Date(now.Year(), now.Month(), now.Day(), 0, 5, 0, 0, ist()).AddDate(0, 0, 1)
			time.Sleep(time.Until(next))
		}
	}()
}

func runForAllSchools(db *gorm.DB, now time.Time) {
	month := int(now.Month())

	var schools []models.School
	if err := db.Find(&schools).Error; err != nil {
		slog.Error("feegen: failed to list schools", "err", err)
		return
	}

	for _, s := range schools {
		// Find the current academic year for this school
		var ay models.AcademicYear
		if err := db.Where("school_id = ? AND is_current = ?", s.ID, true).First(&ay).Error; err != nil {
			slog.Warn("feegen: no current academic year", "school_id", s.ID)
			continue
		}

		res, err := GenerateForMonth(db, s.ID, ay.ID, month)
		if err != nil {
			slog.Error("feegen: generation failed", "school_id", s.ID, "err", err)
			continue
		}
		slog.Info("feegen: generated",
			"school_id", s.ID, "month", month,
			"created", res.Created, "skipped", res.Skipped, "zero", res.Zero)
	}
}

func ist() *time.Location {
	return time.FixedZone("IST", 5*3600+1800)
}
