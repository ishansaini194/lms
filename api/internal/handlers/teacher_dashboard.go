package handlers

import (
	"sort"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/ishansaini194/lms/api/internal/middleware"
	"github.com/ishansaini194/lms/api/internal/models"
	"gorm.io/gorm"
)

type TeacherDashboardHandler struct {
	DB *gorm.DB
}

func NewTeacherDashboardHandler(db *gorm.DB) *TeacherDashboardHandler {
	return &TeacherDashboardHandler{DB: db}
}

// ---- response shapes ----

// tdResponsibility is ONE row per teaching responsibility, NOT per class. The
// same class_year appears multiple times when a teacher both owns it (class
// teacher) and teaches subject(s) in it, or teaches several subjects to it.
// This is intentional — there is no dedup. StudentCount is the class_year's
// active enrollment count, stamped onto every row that shares that class_year.
type tdResponsibility struct {
	ClassYearID    uint   `json:"class_year_id"`
	ClassLabel     string `json:"class_label"`      // "2-A"
	IsClassTeacher bool   `json:"is_class_teacher"` // true → class-teacher role row (Subject empty)
	Subject        string `json:"subject"`          // "" for the class-teacher row; e.g. "Physics" for subject rows
	StudentCount   int    `json:"student_count"`    // active enrollments in this class_year
}

type tdExam struct {
	ID           uint       `json:"id"`
	Name         string     `json:"name"`
	Subject      string     `json:"subject"`
	ClassLabel   string     `json:"class_label"`
	MaxMarks     int        `json:"max_marks"`
	ExamDate     *time.Time `json:"exam_date"`
	NeedsMarks   bool       `json:"needs_marks"`   // roster has students without a result row
	MarksEntered int        `json:"marks_entered"` // count of result rows
	RosterSize   int        `json:"roster_size"`   // active enrollments in the class_year
}

type tdHomework struct {
	ID      uint       `json:"id"`
	Subject string     `json:"subject"`
	Content string     `json:"content"`
	DueDate *time.Time `json:"due_date"`
}

type tdNotice struct {
	ID        uint      `json:"id"`
	Title     string    `json:"title"`
	CreatedAt time.Time `json:"created_at"`
}

type teacherDashboardResponse struct {
	Responsibilities []tdResponsibility `json:"responsibilities"`
	TotalStudents    int                `json:"total_students"` // sum of StudentCount across rows
	ExamsToAction    []tdExam           `json:"exams_to_action"`
	RecentHomework   []tdHomework       `json:"recent_homework"`
	RecentNotices    []tdNotice         `json:"recent_notices"`
}

// emptyTeacherDashboard returns a fully-initialized (non-nil slices) response so
// JSON renders `[]` rather than `null` when there's nothing to show.
func emptyTeacherDashboard() teacherDashboardResponse {
	return teacherDashboardResponse{
		Responsibilities: []tdResponsibility{},
		ExamsToAction:    []tdExam{},
		RecentHomework:   []tdHomework{},
		RecentNotices:    []tdNotice{},
	}
}

func classLabelFrom(name, section string) string {
	if section != "" {
		return name + "-" + section
	}
	return name
}

// GET /api/teacher/dashboard
func (h *TeacherDashboardHandler) Dashboard(c *fiber.Ctx) error {
	teacherID := middleware.GetTeacherID(c)
	schoolID := middleware.GetSchoolID(c)
	userID := middleware.GetUserID(c)
	if teacherID == 0 {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "not a teacher account"})
	}

	// Resolve current academic year; with none, the dashboard is simply empty.
	var ay models.AcademicYear
	if err := h.DB.
		Where("school_id = ? AND is_current = ?", schoolID, true).
		First(&ay).Error; err != nil {
		return c.JSON(emptyTeacherDashboard())
	}

	resp := emptyTeacherDashboard()

	// --- Responsibilities: class-teacher rows ∪ teaching-assignment rows (no dedup) ---

	type clRow struct {
		ID      uint
		Name    string
		Section string
	}
	// Class-teacher class_years (current AY, active).
	var ctRows []clRow
	h.DB.Table("class_years").
		Select("class_years.id, classes.name, classes.section").
		Joins("JOIN classes ON classes.id = class_years.class_id").
		Where("class_years.school_id = ? AND class_years.academic_year_id = ? AND class_years.is_active = ? AND class_years.class_teacher_id = ?",
			schoolID, ay.ID, true, teacherID).
		Order("classes.sort_order ASC").
		Scan(&ctRows)

	// Teaching-assignment rows (active assignment, joined to current-AY active class_years).
	type taRow struct {
		ClassYearID uint
		Name        string
		Section     string
		Subject     string
	}
	var taRows []taRow
	h.DB.Table("teaching_assignments AS ta").
		Select("ta.class_year_id, classes.name, classes.section, ta.subject").
		Joins("JOIN class_years AS cy ON cy.id = ta.class_year_id").
		Joins("JOIN classes ON classes.id = cy.class_id").
		Where("ta.school_id = ? AND ta.teacher_id = ? AND ta.is_active = ? AND cy.academic_year_id = ? AND cy.is_active = ?",
			schoolID, teacherID, true, ay.ID, true).
		Order("classes.sort_order ASC, ta.subject ASC").
		Scan(&taRows)

	// Build the responsibility list: class-teacher rows first, then subject rows.
	// NO dedup — repeats are the model.
	responsibilities := make([]tdResponsibility, 0, len(ctRows)+len(taRows))
	cyIDSet := map[uint]bool{}
	for _, r := range ctRows {
		responsibilities = append(responsibilities, tdResponsibility{
			ClassYearID:    r.ID,
			ClassLabel:     classLabelFrom(r.Name, r.Section),
			IsClassTeacher: true,
			Subject:        "",
		})
		cyIDSet[r.ID] = true
	}
	for _, r := range taRows {
		responsibilities = append(responsibilities, tdResponsibility{
			ClassYearID:    r.ClassYearID,
			ClassLabel:     classLabelFrom(r.Name, r.Section),
			IsClassTeacher: false,
			Subject:        r.Subject,
		})
		cyIDSet[r.ClassYearID] = true
	}

	// Active-enrollment count per DISTINCT class_year, then stamp onto every row
	// that shares that class_year (so 2-A's 30 lands on its class-teacher row AND
	// each subject row). TotalStudents is the plain sum across rows (workload).
	studentCountByCY := map[uint]int{}
	if len(cyIDSet) > 0 {
		cyIDs := make([]uint, 0, len(cyIDSet))
		for id := range cyIDSet {
			cyIDs = append(cyIDs, id)
		}
		type enrCount struct {
			ClassYearID uint
			Cnt         int
		}
		var counts []enrCount
		h.DB.Table("enrollments").
			Select("class_year_id, COUNT(*) AS cnt").
			Where("school_id = ? AND class_year_id IN ? AND status = ?", schoolID, cyIDs, "active").
			Group("class_year_id").
			Scan(&counts)
		for _, cc := range counts {
			studentCountByCY[cc.ClassYearID] = cc.Cnt
		}
	}
	total := 0
	for i := range responsibilities {
		n := studentCountByCY[responsibilities[i].ClassYearID]
		responsibilities[i].StudentCount = n
		total += n
	}
	resp.Responsibilities = responsibilities
	resp.TotalStudents = total

	// --- Exams to action: future-dated (always) OR past-needing-marks (last 60 days) ---

	now := time.Now()
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	cutoff := today.AddDate(0, 0, -60)

	// Candidate set: this teacher's active exams that are future-dated, undated,
	// or dated within the last 60 days. Older past exams never nag.
	var candidates []models.Exam
	h.DB.Where("school_id = ? AND is_active = ? AND teacher_id = ? AND (exam_date IS NULL OR exam_date >= ?)",
		schoolID, true, teacherID, cutoff).
		Order("exam_date ASC NULLS LAST, id DESC").
		Find(&candidates)

	if len(candidates) > 0 {
		examIDs := make([]uint, 0, len(candidates))
		examCYSet := map[uint]bool{}
		for _, e := range candidates {
			examIDs = append(examIDs, e.ID)
			examCYSet[e.ClassYearID] = true
		}
		examCYIDs := make([]uint, 0, len(examCYSet))
		for id := range examCYSet {
			examCYIDs = append(examCYIDs, id)
		}

		// Batched: result rows per exam.
		marksByExam := map[uint]int{}
		{
			type rc struct {
				ExamID uint
				Cnt    int
			}
			var rows []rc
			h.DB.Table("results").
				Select("exam_id, COUNT(*) AS cnt").
				Where("school_id = ? AND exam_id IN ?", schoolID, examIDs).
				Group("exam_id").
				Scan(&rows)
			for _, r := range rows {
				marksByExam[r.ExamID] = r.Cnt
			}
		}
		// Batched: active roster per exam class_year.
		rosterByCY := map[uint]int{}
		{
			type rc struct {
				ClassYearID uint
				Cnt         int
			}
			var rows []rc
			h.DB.Table("enrollments").
				Select("class_year_id, COUNT(*) AS cnt").
				Where("school_id = ? AND class_year_id IN ? AND status = ?", schoolID, examCYIDs, "active").
				Group("class_year_id").
				Scan(&rows)
			for _, r := range rows {
				rosterByCY[r.ClassYearID] = r.Cnt
			}
		}
		// Batched: class labels per exam class_year.
		labelByCY := map[uint]string{}
		{
			type clRow2 struct {
				ID      uint
				Name    string
				Section string
			}
			var rows []clRow2
			h.DB.Table("class_years").
				Select("class_years.id, classes.name, classes.section").
				Joins("JOIN classes ON classes.id = class_years.class_id").
				Where("class_years.school_id = ? AND class_years.id IN ?", schoolID, examCYIDs).
				Scan(&rows)
			for _, r := range rows {
				labelByCY[r.ID] = classLabelFrom(r.Name, r.Section)
			}
		}

		out := make([]tdExam, 0, len(candidates))
		for _, e := range candidates {
			roster := rosterByCY[e.ClassYearID]
			entered := marksByExam[e.ID]
			needsMarks := entered < roster
			isFuture := e.ExamDate != nil && !e.ExamDate.Before(today)
			// Future/today exams always surface; past/undated only when marks are missing.
			if !isFuture && !needsMarks {
				continue
			}
			out = append(out, tdExam{
				ID:           e.ID,
				Name:         e.Name,
				Subject:      e.Subject,
				ClassLabel:   labelByCY[e.ClassYearID],
				MaxMarks:     e.MaxMarks,
				ExamDate:     e.ExamDate,
				NeedsMarks:   needsMarks,
				MarksEntered: entered,
				RosterSize:   roster,
			})
		}
		// Needs-marks first, then soonest upcoming (undated last).
		sort.SliceStable(out, func(i, j int) bool {
			if out[i].NeedsMarks != out[j].NeedsMarks {
				return out[i].NeedsMarks
			}
			a, b := out[i].ExamDate, out[j].ExamDate
			if a == nil {
				return false
			}
			if b == nil {
				return true
			}
			return a.Before(*b)
		})
		if len(out) > 8 {
			out = out[:8]
		}
		resp.ExamsToAction = out
	}

	// --- Recent homework (this teacher) ---
	var hw []models.Homework
	h.DB.Where("school_id = ? AND is_active = ? AND teacher_id = ?", schoolID, true, teacherID).
		Order("due_date DESC NULLS LAST, id DESC").
		Limit(5).
		Find(&hw)
	for _, x := range hw {
		resp.RecentHomework = append(resp.RecentHomework, tdHomework{
			ID:      x.ID,
			Subject: x.Subject,
			Content: x.Content,
			DueDate: x.DueDate,
		})
	}

	// --- Recent notices (scoped by user_id, matching the notices handler) ---
	var notices []models.Notice
	h.DB.Where("school_id = ? AND is_active = ? AND posted_by_id = ?", schoolID, true, userID).
		Order("created_at DESC").
		Limit(5).
		Find(&notices)
	for _, n := range notices {
		resp.RecentNotices = append(resp.RecentNotices, tdNotice{
			ID:        n.ID,
			Title:     n.Title,
			CreatedAt: n.CreatedAt,
		})
	}

	return c.JSON(resp)
}
