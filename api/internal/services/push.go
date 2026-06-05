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

	// 2. Resolve target student IDs (school-wide or via target class-years).
	studentIDs, err := noticeTargetStudentIDs(db, schoolID, &notice)
	if err != nil {
		log.Printf("[push] notice %d: failed resolving target students: %v", noticeID, err)
		return
	}
	if len(studentIDs) == 0 {
		return
	}

	// 3. student_id → student user → push_subscriptions, all batched (no N+1).
	var userIDs []uint
	if err := db.Model(&models.User{}).
		Where("school_id = ? AND role = ? AND is_active = ? AND student_id IN ?",
			schoolID, "student", true, studentIDs).
		Pluck("id", &userIDs).Error; err != nil {
		log.Printf("[push] notice %d: failed resolving student users: %v", noticeID, err)
		return
	}
	if len(userIDs) == 0 {
		return
	}

	var subs []models.PushSubscription
	if err := db.Where("school_id = ? AND user_id IN ?", schoolID, userIDs).
		Find(&subs).Error; err != nil {
		log.Printf("[push] notice %d: failed loading subscriptions: %v", noticeID, err)
		return
	}
	if len(subs) == 0 {
		return
	}

	// 4. Build the payload once.
	payload, err := json.Marshal(pushPayload{
		Title: notice.Title,
		Body:  snippet(notice.Body, 140),
		URL:   "/student/notices",
	})
	if err != nil {
		log.Printf("[push] notice %d: failed marshaling payload: %v", noticeID, err)
		return
	}

	// 5. Send to each subscription; clean dead ones (410 Gone / 404).
	var sent, failed, cleaned int
	for i := range subs {
		sub := subs[i]
		resp, err := webpush.SendNotification(payload, &webpush.Subscription{
			Endpoint: sub.Endpoint,
			Keys:     webpush.Keys{P256dh: sub.P256dh, Auth: sub.Auth},
		}, &webpush.Options{
			Subscriber:      pushCfg.contact,
			VAPIDPublicKey:  pushCfg.publicKey,
			VAPIDPrivateKey: pushCfg.privateKey,
			TTL:             86400, // keep up to 24h if the device is offline
		})
		if err != nil {
			failed++
			log.Printf("[push] notice %d: send error (sub %d): %v", noticeID, sub.ID, err)
			continue
		}
		status := resp.StatusCode
		resp.Body.Close()

		switch {
		case status == 410 || status == 404:
			// Expired/unsubscribed endpoint → remove the stale row.
			if delErr := db.Where("id = ?", sub.ID).Delete(&models.PushSubscription{}).Error; delErr == nil {
				cleaned++
			} else {
				log.Printf("[push] notice %d: failed cleaning dead sub %d: %v", noticeID, sub.ID, delErr)
			}
		case status >= 200 && status < 300:
			sent++
		default:
			failed++
			log.Printf("[push] notice %d: non-2xx (sub %d): %d", noticeID, sub.ID, status)
		}
	}
	log.Printf("[push] notice %d: sent %d, failed %d, cleaned %d", noticeID, sent, failed, cleaned)
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
