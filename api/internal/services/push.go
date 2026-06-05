package services

import (
	"encoding/json"
	"log"
	"os"
	"strings"
	"sync"

	webpush "github.com/SherClockHolmes/webpush-go"
	"github.com/ishansaini194/lms/api/internal/models"
	"gorm.io/gorm"
)

// VAPID config, read once at startup. If any value is missing, push sending is
// disabled (the app still runs) — see InitPush.
type pushConfig struct {
	publicKey  string
	privateKey string
	contact    string
	enabled    bool
}

var (
	pushCfg  pushConfig
	pushOnce sync.Once
)

// InitPush reads VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_CONTACT from the
// environment once, at startup. If any is unset, push sending is disabled and a
// warning is logged — the app runs fine without push configured. Safe to call
// multiple times.
func InitPush() {
	pushOnce.Do(func() {
		pub := strings.TrimSpace(os.Getenv("VAPID_PUBLIC_KEY"))
		priv := strings.TrimSpace(os.Getenv("VAPID_PRIVATE_KEY"))
		contact := strings.TrimSpace(os.Getenv("VAPID_CONTACT"))
		if pub == "" || priv == "" || contact == "" {
			log.Println("[push] VAPID not fully configured — set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_CONTACT to enable; push sending disabled")
			return
		}
		pushCfg = pushConfig{publicKey: pub, privateKey: priv, contact: contact, enabled: true}
		log.Println("[push] web push enabled")
	})
}

// PushEnabled reports whether VAPID is configured (mostly for tests/diagnostics).
func PushEnabled() bool { return pushCfg.enabled }

// payload is the small JSON the service worker renders.
type pushPayload struct {
	Title string `json:"title"`
	Body  string `json:"body"`
	URL   string `json:"url"`
}

// SendNoticePush delivers a Web Push to every subscribed student/parent the
// notice targets. Fire-and-forget — call as `go SendNoticePush(db, schoolID,
// noticeID)`. It uses the *gorm.DB handle directly (safe for concurrent use) and
// NEVER the Fiber request context, so it can safely outlive the request.
func SendNoticePush(db *gorm.DB, schoolID, noticeID uint) {
	if !pushCfg.enabled {
		return
	}
	// A background goroutine must never crash the process.
	defer func() {
		if r := recover(); r != nil {
			log.Printf("[push] recovered while sending notice %d: %v", noticeID, r)
		}
	}()

	// 1. Load the notice (school-scoped).
	var notice models.Notice
	if err := db.Where("id = ? AND school_id = ?", noticeID, schoolID).First(&notice).Error; err != nil {
		log.Printf("[push] notice %d not found for school %d: %v", noticeID, schoolID, err)
		return
	}

	// 2. Resolve recipient subscriptions, per role, each with the URL its portal
	// should open. Students/parents always; teachers only for ADMIN-posted notices
	// (a teacher's own class notice still reaches students/parents only — it never
	// pushes to other teachers). We do NOT early-return on an empty student set: a
	// school-wide admin notice with teachers subscribed but no students must still
	// reach those teachers.
	recipients := map[uint]recipient{} // keyed by subscription id → de-dupes

	// --- Students/parents (existing path) ---
	studentSubs, err := studentNoticeSubs(db, schoolID, &notice)
	if err != nil {
		log.Printf("[push] notice %d: failed resolving student subscriptions: %v", noticeID, err)
		return
	}
	for i := range studentSubs {
		recipients[studentSubs[i].ID] = recipient{sub: studentSubs[i], url: "/student/notices", isTeacher: false}
	}

	// --- Teachers (admin notices only) ---
	if noticeReachesTeachers(db, schoolID, &notice) {
		teacherSubs, err := teacherNoticeSubs(db, schoolID, &notice)
		if err != nil {
			log.Printf("[push] notice %d: failed resolving teacher subscriptions: %v", noticeID, err)
			return
		}
		for i := range teacherSubs {
			// Skip if this exact subscription is already a student recipient (a
			// shared device endpoint maps to one row, so this is belt-and-braces).
			if _, dup := recipients[teacherSubs[i].ID]; dup {
				continue
			}
			recipients[teacherSubs[i].ID] = recipient{sub: teacherSubs[i], url: "/teacher/notices", isTeacher: true}
		}
	}

	if len(recipients) == 0 {
		return
	}

	// 3. Send to each subscription with its per-role URL; clean dead ones (410/404).
	var sentStudents, sentTeachers, failed, cleaned int
	for _, r := range recipients {
		payload, err := json.Marshal(pushPayload{
			Title: notice.Title,
			Body:  snippet(notice.Body, 140),
			URL:   r.url,
		})
		if err != nil {
			failed++
			log.Printf("[push] notice %d: failed marshaling payload (sub %d): %v", noticeID, r.sub.ID, err)
			continue
		}

		resp, err := webpush.SendNotification(payload, &webpush.Subscription{
			Endpoint: r.sub.Endpoint,
			Keys:     webpush.Keys{P256dh: r.sub.P256dh, Auth: r.sub.Auth},
		}, &webpush.Options{
			Subscriber:      pushCfg.contact,
			VAPIDPublicKey:  pushCfg.publicKey,
			VAPIDPrivateKey: pushCfg.privateKey,
			TTL:             86400, // keep up to 24h if the device is offline
		})
		if err != nil {
			failed++
			log.Printf("[push] notice %d: send error (sub %d): %v", noticeID, r.sub.ID, err)
			continue
		}
		status := resp.StatusCode
		resp.Body.Close()

		switch {
		case status == 410 || status == 404:
			// Expired/unsubscribed endpoint → remove the stale row.
			if delErr := db.Where("id = ?", r.sub.ID).Delete(&models.PushSubscription{}).Error; delErr == nil {
				cleaned++
			} else {
				log.Printf("[push] notice %d: failed cleaning dead sub %d: %v", noticeID, r.sub.ID, delErr)
			}
		case status >= 200 && status < 300:
			if r.isTeacher {
				sentTeachers++
			} else {
				sentStudents++
			}
		default:
			failed++
			log.Printf("[push] notice %d: non-2xx (sub %d): %d", noticeID, r.sub.ID, status)
		}
	}
	log.Printf("[push] notice %d: sent %d (students %d, teachers %d), failed %d, cleaned %d",
		noticeID, sentStudents+sentTeachers, sentStudents, sentTeachers, failed, cleaned)
}

// recipient pairs a subscription with the URL its portal should open and whether
// it belongs to a teacher (for the per-role send counters).
type recipient struct {
	sub       models.PushSubscription
	url       string
	isTeacher bool
}

// studentNoticeSubs resolves the push_subscriptions of students/parents a notice
// reaches: target students → their active student-role users → subscriptions.
// School-scoped, batched (no N+1). Empty (not an error) when nobody matches.
func studentNoticeSubs(db *gorm.DB, schoolID uint, notice *models.Notice) ([]models.PushSubscription, error) {
	studentIDs, err := noticeTargetStudentIDs(db, schoolID, notice)
	if err != nil || len(studentIDs) == 0 {
		return nil, err
	}

	var userIDs []uint
	if err := db.Model(&models.User{}).
		Where("school_id = ? AND role = ? AND is_active = ? AND student_id IN ?",
			schoolID, "student", true, studentIDs).
		Pluck("id", &userIDs).Error; err != nil {
		return nil, err
	}
	if len(userIDs) == 0 {
		return nil, nil
	}

	var subs []models.PushSubscription
	err = db.Where("school_id = ? AND user_id IN ?", schoolID, userIDs).Find(&subs).Error
	return subs, err
}

// noticeReachesTeachers reports whether a notice should push to teachers at all:
// only ADMIN-posted notices reach teachers (matching the Stage A rule that admin
// notices reach teachers, while teacher-posted notices stay students/parents
// only). Resolved from the poster's role, school-scoped.
func noticeReachesTeachers(db *gorm.DB, schoolID uint, notice *models.Notice) bool {
	var role string
	if err := db.Model(&models.User{}).
		Where("id = ? AND school_id = ?", notice.PostedByID, schoolID).
		Pluck("role", &role).Error; err != nil {
		log.Printf("[push] notice %d: failed resolving poster role: %v", notice.ID, err)
		return false
	}
	return role == "admin"
}

// teacherNoticeSubs resolves the push_subscriptions of teachers a notice reaches,
// mirroring Stage A's display targeting EXACTLY:
//   - school-wide → all active teacher-role users in the school;
//   - class notice → the class teacher(s) of the targeted class-years only
//     (class_years.class_teacher_id; NOT subject teachers).
//
// Tenant safety: two simple, separately school-scoped queries — no OR, nothing to
// flatten (the Stage A lesson: a raw-string OR ANDed with school_id leaks across
// tenants). School-scoped, batched.
func teacherNoticeSubs(db *gorm.DB, schoolID uint, notice *models.Notice) ([]models.PushSubscription, error) {
	userIDs, err := noticeTargetTeacherUserIDs(db, schoolID, notice)
	if err != nil || len(userIDs) == 0 {
		return nil, err
	}
	var subs []models.PushSubscription
	err = db.Where("school_id = ? AND user_id IN ?", schoolID, userIDs).Find(&subs).Error
	return subs, err
}

// noticeTargetTeacherUserIDs returns the active teacher-role user IDs a notice
// reaches. School-scoped, batched, no OR.
func noticeTargetTeacherUserIDs(db *gorm.DB, schoolID uint, notice *models.Notice) ([]uint, error) {
	var userIDs []uint

	if notice.TargetAllSchool {
		// All active teacher-role users in the school.
		err := db.Model(&models.User{}).
			Where("school_id = ? AND role = ? AND is_active = ?", schoolID, "teacher", true).
			Pluck("id", &userIDs).Error
		return userIDs, err
	}

	// Class teacher(s) of the notice's target class-years (school-scoped).
	var teacherIDs []uint
	if err := db.Model(&models.ClassYear{}).
		Joins("JOIN notice_targets nt ON nt.class_year_id = class_years.id").
		Where("nt.notice_id = ? AND class_years.school_id = ? AND class_years.class_teacher_id IS NOT NULL",
			notice.ID, schoolID).
		Distinct("class_years.class_teacher_id").
		Pluck("class_years.class_teacher_id", &teacherIDs).Error; err != nil {
		return nil, err
	}
	if len(teacherIDs) == 0 {
		return nil, nil
	}

	// Those teachers → their active teacher-role users (school-scoped).
	err := db.Model(&models.User{}).
		Where("school_id = ? AND role = ? AND is_active = ? AND teacher_id IN ?",
			schoolID, "teacher", true, teacherIDs).
		Pluck("id", &userIDs).Error
	return userIDs, err
}

// noticeTargetStudentIDs returns the distinct active-student IDs a notice
// reaches: all active students (school-wide) or those with active enrollments in
// the notice's target class-years. School-scoped, batched.
func noticeTargetStudentIDs(db *gorm.DB, schoolID uint, notice *models.Notice) ([]uint, error) {
	var studentIDs []uint

	if notice.TargetAllSchool {
		err := db.Model(&models.Student{}).
			Where("school_id = ? AND is_active = ?", schoolID, true).
			Pluck("id", &studentIDs).Error
		return studentIDs, err
	}

	var classYearIDs []uint
	if err := db.Model(&models.NoticeTarget{}).
		Where("notice_id = ?", notice.ID).
		Pluck("class_year_id", &classYearIDs).Error; err != nil {
		return nil, err
	}
	if len(classYearIDs) == 0 {
		return nil, nil
	}

	err := db.Model(&models.Enrollment{}).
		Distinct("student_id").
		Where("school_id = ? AND class_year_id IN ? AND status = ?", schoolID, classYearIDs, "active").
		Pluck("student_id", &studentIDs).Error
	return studentIDs, err
}

// snippet trims body text to a short, rune-safe notification preview.
func snippet(s string, n int) string {
	s = strings.TrimSpace(s)
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return strings.TrimSpace(string(r[:n-1])) + "…"
}
