package app

import (
	"os"
	"time"

	"github.com/ansrivas/fiberprometheus/v2"
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/limiter"
	"github.com/ishansaini194/lms/api/internal/database"
	"github.com/ishansaini194/lms/api/internal/handlers"
	"github.com/ishansaini194/lms/api/internal/middleware"
	"github.com/ishansaini194/lms/api/internal/server"
	"github.com/ishansaini194/lms/api/internal/services"
	"gorm.io/gorm"
)

func New() (*server.Server, error) {
	db, err := database.Connect()
	if err != nil {
		return nil, err
	}

	// Read VAPID config once at startup (logs + disables push gracefully if unset).
	services.InitPush()

	srv := server.New(db)
	registerRoutes(srv, db)
	return srv, nil
}

func registerRoutes(srv *server.Server, db *gorm.DB) {
	// Prometheus metrics — registered before routes so it instruments all
	// requests. /metrics is bound to localhost only and is intentionally NOT
	// proxied through nginx, so it stays private (local scraping only).
	prometheus := fiberprometheus.New("studyme")
	prometheus.RegisterAt(srv.App, "/metrics")
	srv.App.Use(prometheus.Middleware)

	api := srv.App.Group("/api")

	// ---------- Public routes ----------
	authHandler := handlers.NewAuthHandler(db)

	allowOrigins := os.Getenv("CORS_ORIGINS")
	if allowOrigins == "" {
		allowOrigins = "http://localhost:5173"
	}

	srv.App.Use(cors.New(cors.Config{
		AllowOrigins: allowOrigins,
		AllowHeaders: "Origin, Content-Type, Accept, Authorization",
		AllowMethods: "GET, POST, PUT, DELETE, OPTIONS",
	}))

	// Public health check — no auth, no DB/version info. For Docker
	// healthcheck and uptime monitoring.
	api.Get("/health", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{"status": "ok"})
	})

	loginLimiter := limiter.New(limiter.Config{
		Max:        200,
		Expiration: 1 * time.Minute,
		LimitReached: func(c *fiber.Ctx) error {
			return c.Status(fiber.StatusTooManyRequests).JSON(fiber.Map{
				"error": "too many login attempts, try again in a minute",
			})
		},
	})

	api.Post("/login", loginLimiter, authHandler.Login)

	// Public school list for the login dropdown — no auth. Exposes only
	// id/code/name (see SchoolHandler.ListPublic).
	api.Get("/schools", handlers.NewSchoolHandler(db).ListPublic)

	// ---------- Authenticated routes (any role) ----------
	authGroup := api.Group("/auth", middleware.AuthRequired())
	authGroup.Post("/change-password", authHandler.ChangePassword)
	authGroup.Post("/reset-password/:id", authHandler.ResetPassword)

	// ---------- Admin-only routes ----------

	// Teachers
	teacherHandler := handlers.NewTeachersHandler(db)

	teachers := api.Group("/teachers", middleware.AuthRequired(), middleware.RequireRole("admin"))
	teachers.Get("/", teacherHandler.ListTeachers)
	teachers.Get("/:id", teacherHandler.GetTeacher)
	teachers.Post("/", teacherHandler.CreateTeacher)
	teachers.Put("/:id", teacherHandler.UpdateTeacher)
	teachers.Delete("/:id", teacherHandler.DeleteTeacher)
	teachers.Post("/:id/reactivate", teacherHandler.ReactivateTeacher)

	// Students
	studentsHandler := handlers.NewStudentsHandler(db)

	students := api.Group("/students", middleware.AuthRequired(), middleware.RequireRole("admin"))
	students.Get("/", studentsHandler.ListStudents)
	students.Get("/:id", studentsHandler.GetStudent)
	students.Post("/", studentsHandler.CreateStudent)
	students.Put("/:id", studentsHandler.UpdateStudent)
	students.Delete("/:id", studentsHandler.DeleteStudent)
	students.Post("/:id/reactivate", studentsHandler.ReactivateStudent)

	// School profile (read-only for now)
	schoolHandler := handlers.NewSchoolHandler(db)

	school := api.Group("/school", middleware.AuthRequired(), middleware.RequireRole("admin"))
	school.Get("/", schoolHandler.Get)
	school.Put("/", schoolHandler.Update)

	// Academic Years (no DELETE — edit only)
	academicYearHandler := handlers.NewAcademicYearHandler(db)

	// Reads open to teachers too (e.g. the library upload needs the current AY);
	// mutations stay admin-only.
	academicYears := api.Group("/academic-years", middleware.AuthRequired())
	academicYears.Get("/", middleware.RequireRole("admin", "teacher"), academicYearHandler.List)
	academicYears.Get("/:id", middleware.RequireRole("admin", "teacher"), academicYearHandler.GetOne)
	academicYears.Post("/", middleware.RequireRole("admin"), academicYearHandler.Create)
	academicYears.Put("/:id", middleware.RequireRole("admin"), academicYearHandler.Update)

	// Classes
	classHandler := handlers.NewClassHandler(db)

	classes := api.Group("/classes", middleware.AuthRequired(), middleware.RequireRole("admin"))
	classes.Get("/", classHandler.List)
	classes.Get("/:id", classHandler.GetOne)
	classes.Post("/", classHandler.Create)
	classes.Put("/:id", classHandler.Update)
	classes.Delete("/:id", classHandler.Delete)
	classes.Patch("/reorder", classHandler.Reorder)

	// Class Years
	classYearHandler := handlers.NewClassYearHandler(db)

	classYears := api.Group("/class-years", middleware.AuthRequired())
	classYears.Get("/", middleware.RequireRole("admin", "teacher"), classYearHandler.List)
	classYears.Get("/:id", middleware.RequireRole("admin", "teacher"), classYearHandler.GetOne)
	classYears.Post("/", middleware.RequireRole("admin"), classYearHandler.Create)
	classYears.Put("/:id", middleware.RequireRole("admin"), classYearHandler.Update)
	classYears.Delete("/:id", middleware.RequireRole("admin"), classYearHandler.Delete)

	// Enrollments
	enrollmentHandler := handlers.NewEnrollmentsHandler(db)

	enrollments := api.Group("/enrollments", middleware.AuthRequired())
	enrollments.Get("/", middleware.RequireRole("admin", "teacher"), enrollmentHandler.List)
	enrollments.Get("/:id", middleware.RequireRole("admin", "teacher"), enrollmentHandler.GetOne)
	enrollments.Put("/:id", middleware.RequireRole("admin"), enrollmentHandler.Update)
	// Admin promotes any class school-wide; a class-teacher may promote only the
	// class they're the class-teacher of (gated inside the handler).
	enrollments.Post("/promote", middleware.RequireRole("admin", "teacher"), enrollmentHandler.Promote)

	// Notices
	noticesHandler := handlers.NewNoticesHandler(db, "uploads/notices")

	// Attachment download is open to any authenticated school member (students
	// included) — registered before the admin/teacher group.
	api.Get("/notices/:id/attachment/download", middleware.AuthRequired(), noticesHandler.DownloadAttachment)

	notices := api.Group("/notices", middleware.AuthRequired(), middleware.RequireRole("admin", "teacher"))
	notices.Get("/", noticesHandler.List)
	notices.Get("/:id", noticesHandler.GetOne)
	notices.Post("/", noticesHandler.Create)
	notices.Put("/:id", noticesHandler.Update)
	notices.Delete("/:id", noticesHandler.Delete)

	// Homeworks
	homeworksHandler := handlers.NewHomeworksHandler(db)

	homeworks := api.Group("/homeworks", middleware.AuthRequired(), middleware.RequireRole("admin", "teacher"))
	homeworks.Get("/", homeworksHandler.List)
	homeworks.Get("/:id", homeworksHandler.GetOne)
	homeworks.Post("/", homeworksHandler.Create)
	homeworks.Put("/:id", homeworksHandler.Update)
	homeworks.Delete("/:id", homeworksHandler.Delete)

	// Exam Terms (school-wide terms that group subject-exams). Reads are open to
	// teachers too (the teacher exam-create modal needs the term picker); the
	// list handler self-scopes by the JWT school. Mutations stay admin-only.
	// Subjects (per-school master list)
	subjectsHandler := handlers.NewSubjectsHandler(db)
	subjects := api.Group("/subjects", middleware.AuthRequired())
	subjects.Get("/", subjectsHandler.List) // all roles
	subjects.Post("/", middleware.RequireRole("admin"), subjectsHandler.Create)
	subjects.Put("/:id", middleware.RequireRole("admin"), subjectsHandler.Update)
	subjects.Delete("/:id", middleware.RequireRole("admin"), subjectsHandler.Delete)

	examTermsHandler := handlers.NewExamTermsHandler(db)

	examTerms := api.Group("/exam-terms", middleware.AuthRequired())
	examTerms.Get("/", middleware.RequireRole("admin", "teacher"), examTermsHandler.List)
	examTerms.Post("/", middleware.RequireRole("admin"), examTermsHandler.Create)
	examTerms.Put("/:id", middleware.RequireRole("admin"), examTermsHandler.Update)
	examTerms.Delete("/:id", middleware.RequireRole("admin"), examTermsHandler.Delete)

	// Exams
	examsHandler := handlers.NewExamsHandler(db)

	exams := api.Group("/exams", middleware.AuthRequired(), middleware.RequireRole("admin", "teacher"))
	exams.Get("/", examsHandler.List)
	exams.Get("/:id", examsHandler.GetOne)
	exams.Post("/", examsHandler.Create)
	exams.Put("/:id", examsHandler.Update)
	exams.Delete("/:id", examsHandler.Delete)
	exams.Post("/:id/results", examsHandler.EnterResults)
	exams.Get("/:id/results", examsHandler.ListResults)

	// Dashboard
	dashboardHandler := handlers.NewDashboardHandler(db)

	dashboard := api.Group("/dashboard", middleware.AuthRequired(), middleware.RequireRole("admin"))
	dashboard.Get("/stats", dashboardHandler.Stats)

	// Teacher dashboard
	teacherDashboardHandler := handlers.NewTeacherDashboardHandler(db)

	teacherDash := api.Group("/teacher", middleware.AuthRequired(), middleware.RequireRole("teacher"))
	teacherDash.Get("/dashboard", teacherDashboardHandler.Dashboard)

	teacherProfileHandler := handlers.NewTeacherProfileHandler(db)
	teacherDash.Get("/profile", teacherProfileHandler.Profile)

	// Assessments
	assessmentsHandler := handlers.NewAssessmentsHandler(db)

	assessments := api.Group("/assessments", middleware.AuthRequired(), middleware.RequireRole("admin", "teacher"))
	assessments.Get("/", assessmentsHandler.List)
	assessments.Get("/:id", assessmentsHandler.GetOne)
	assessments.Post("/", assessmentsHandler.Create)
	assessments.Put("/:id", assessmentsHandler.Update)
	assessments.Delete("/:id", assessmentsHandler.Delete)
	assessments.Post("/:id/marks", assessmentsHandler.EnterMarks)
	assessments.Get("/:id/marks", assessmentsHandler.ListMarks)

	// Library
	libraryHandler := handlers.NewLibraryHandler(db, "uploads/library")

	library := api.Group("/library", middleware.AuthRequired(), middleware.RequireRole("admin", "teacher"))
	library.Get("/", libraryHandler.List)
	library.Get("/:id/download", libraryHandler.Download)
	library.Get("/:id", libraryHandler.GetOne)
	library.Post("/", libraryHandler.Upload)
	library.Delete("/:id", libraryHandler.Delete)

	// Teaching Assignments (admin manages who teaches what)
	taHandler := handlers.NewTeachingAssignmentsHandler(db)

	teachingAssignments := api.Group("/teaching-assignments", middleware.AuthRequired(), middleware.RequireRole("admin"))
	teachingAssignments.Get("/", taHandler.List)
	teachingAssignments.Post("/", taHandler.Create)
	teachingAssignments.Delete("/:id", taHandler.Delete)

	// Fees
	feesHandler := handlers.NewFeesHandler(db)

	fees := api.Group("/fees", middleware.AuthRequired(), middleware.RequireRole("admin"))
	fees.Post("/generate", feesHandler.Generate) // before /:id routes
	fees.Get("/", feesHandler.List)
	fees.Get("/:id", feesHandler.GetOne)
	fees.Post("/", feesHandler.Create)
	fees.Put("/:id", feesHandler.Update)

	// Payments
	paymentsHandler := handlers.NewPaymentsHandler(db)

	payments := api.Group("/payments", middleware.AuthRequired(), middleware.RequireRole("admin"))
	payments.Get("/", paymentsHandler.List)
	payments.Post("/", paymentsHandler.Create)
	payments.Post("/:id/reverse", paymentsHandler.Reverse)

	// Users & roles (admins + teachers; students managed via /students)
	usersHandler := handlers.NewUsersHandler(db)

	users := api.Group("/users", middleware.AuthRequired(), middleware.RequireRole("admin"))
	users.Get("/", usersHandler.List)
	users.Post("/:id/deactivate", usersHandler.Deactivate)
	users.Post("/:id/reactivate", usersHandler.Reactivate)

	// Audit Logs
	auditHandler := handlers.NewAuditLogsHandler(db)

	auditLogs := api.Group("/audit-logs", middleware.AuthRequired(), middleware.RequireRole("admin"))
	auditLogs.Get("/", auditHandler.List)

	// ---------- Student portal (read-only, scoped to own data) ----------
	studentPortalHandler := handlers.NewStudentPortalHandler(db, "uploads/library")

	// Web Push device subscriptions — shared by students AND teachers. Register
	// this before the student-only /me group: Fiber group middleware is
	// order-sensitive, and the /me student gate would otherwise intercept this
	// /me child path for teachers.
	pushSubMW := []fiber.Handler{middleware.AuthRequired(), middleware.RequireRole("student", "teacher")}
	api.Post("/me/push-subscription", append(pushSubMW, studentPortalHandler.SavePushSubscription)...)
	api.Delete("/me/push-subscription", append(pushSubMW, studentPortalHandler.DeletePushSubscription)...)

	me := api.Group("/me", middleware.AuthRequired(), middleware.RequireRole("student"))
	me.Get("/profile", studentPortalHandler.Profile)
	me.Get("/enrollments", studentPortalHandler.Enrollments)
	me.Get("/fees", studentPortalHandler.Fees)
	me.Get("/fees/:id/payments", studentPortalHandler.FeePayments)
	me.Get("/notices", studentPortalHandler.Notices)
	me.Get("/homework", studentPortalHandler.Homework)
	me.Get("/results", studentPortalHandler.Results)
	me.Get("/assessment-marks", studentPortalHandler.AssessmentMarks)
	me.Get("/library", studentPortalHandler.Library)
	me.Get("/library/:id/download", studentPortalHandler.LibraryDownload)
}
