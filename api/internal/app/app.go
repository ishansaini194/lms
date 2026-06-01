package app

import (
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/limiter"
	"github.com/ishansaini194/lms/api/internal/database"
	"github.com/ishansaini194/lms/api/internal/handlers"
	"github.com/ishansaini194/lms/api/internal/middleware"
	"github.com/ishansaini194/lms/api/internal/server"
	"gorm.io/gorm"
)

func New() (*server.Server, error) {
	db, err := database.Connect()
	if err != nil {
		return nil, err
	}

	srv := server.New(db)
	registerRoutes(srv, db)
	return srv, nil
}

func registerRoutes(srv *server.Server, db *gorm.DB) {
	api := srv.App.Group("/api")

	// ---------- Public routes ----------
	authHandler := handlers.NewAuthHandler(db)

	srv.App.Use(cors.New(cors.Config{
		AllowOrigins: "http://localhost:5173",
		AllowHeaders: "Origin, Content-Type, Accept, Authorization",
		AllowMethods: "GET, POST, PUT, DELETE, OPTIONS",
	}))

	loginLimiter := limiter.New(limiter.Config{
		Max:        10,
		Expiration: 1 * time.Minute,
		LimitReached: func(c *fiber.Ctx) error {
			return c.Status(fiber.StatusTooManyRequests).JSON(fiber.Map{
				"error": "too many login attempts, try again in a minute",
			})
		},
	})

	api.Post("/login", loginLimiter, authHandler.Login)

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

	// Students
	studentsHandler := handlers.NewStudentsHandler(db)

	students := api.Group("/students", middleware.AuthRequired(), middleware.RequireRole("admin"))
	students.Get("/", studentsHandler.ListStudents)
	students.Get("/:id", studentsHandler.GetStudent)
	students.Post("/", studentsHandler.CreateStudent)
	students.Put("/:id", studentsHandler.UpdateStudent)
	students.Delete("/:id", studentsHandler.DeleteStudent)
	students.Post("/:id/reactivate", studentsHandler.ReactivateStudent)

	// Academic Years (no DELETE — edit only)
	academicYearHandler := handlers.NewAcademicYearHandler(db)

	academicYears := api.Group("/academic-years", middleware.AuthRequired(), middleware.RequireRole("admin"))
	academicYears.Get("/", academicYearHandler.List)
	academicYears.Get("/:id", academicYearHandler.GetOne)
	academicYears.Post("/", academicYearHandler.Create)
	academicYears.Put("/:id", academicYearHandler.Update)

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
	enrollments.Post("/promote", middleware.RequireRole("admin"), enrollmentHandler.Promote)

	// Notices
	noticesHandler := handlers.NewNoticesHandler(db)

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

	library := api.Group("/library", middleware.AuthRequired(), middleware.RequireRole("admin"))
	library.Get("/", libraryHandler.List)
	library.Post("/", libraryHandler.Upload)
	library.Get("/:id/download", libraryHandler.Download)
	library.Delete("/:id", libraryHandler.Delete)

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

	// Audit Logs
	auditHandler := handlers.NewAuditLogsHandler(db)

	auditLogs := api.Group("/audit-logs", middleware.AuthRequired(), middleware.RequireRole("admin"))
	auditLogs.Get("/", auditHandler.List)

	// ---------- Student portal (read-only, scoped to own data) ----------
	studentPortalHandler := handlers.NewStudentPortalHandler(db, "uploads/library")

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
