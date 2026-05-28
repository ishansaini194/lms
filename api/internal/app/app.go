package app

import (
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
	api.Post("/login", authHandler.Login)

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

	classYears := api.Group("/class-years", middleware.AuthRequired(), middleware.RequireRole("admin"))
	classYears.Get("/", classYearHandler.List)
	classYears.Get("/:id", classYearHandler.GetOne)
	classYears.Post("/", classYearHandler.Create)
	classYears.Put("/:id", classYearHandler.Update)
	classYears.Delete("/:id", classYearHandler.Delete)

	// Enrollments
	enrollmentHandler := handlers.NewEnrollmentsHandler(db)

	enrollments := api.Group("/enrollments", middleware.AuthRequired(), middleware.RequireRole("admin"))
	enrollments.Get("/", enrollmentHandler.List)
	enrollments.Get("/:id", enrollmentHandler.GetOne)
	enrollments.Put("/:id", enrollmentHandler.Update)
	enrollments.Post("/promote", enrollmentHandler.Promote)

	// Notices
	noticesHandler := handlers.NewNoticesHandler(db)

	notices := api.Group("/notices", middleware.AuthRequired(), middleware.RequireRole("admin"))
	notices.Get("/", noticesHandler.List)
	notices.Get("/:id", noticesHandler.GetOne)
	notices.Post("/", noticesHandler.Create)
	notices.Put("/:id", noticesHandler.Update)
	notices.Delete("/:id", noticesHandler.Delete)

	// Homeworks
	homeworksHandler := handlers.NewHomeworksHandler(db)

	homeworks := api.Group("/homeworks", middleware.AuthRequired(), middleware.RequireRole("admin"))
	homeworks.Get("/", homeworksHandler.List)
	homeworks.Get("/:id", homeworksHandler.GetOne)
	homeworks.Post("/", homeworksHandler.Create)
	homeworks.Put("/:id", homeworksHandler.Update)
	homeworks.Delete("/:id", homeworksHandler.Delete)

	// Exams
	examsHandler := handlers.NewExamsHandler(db)

	exams := api.Group("/exams", middleware.AuthRequired(), middleware.RequireRole("admin"))
	exams.Get("/", examsHandler.List)
	exams.Get("/:id", examsHandler.GetOne)
	exams.Post("/", examsHandler.Create)
	exams.Put("/:id", examsHandler.Update)
	exams.Delete("/:id", examsHandler.Delete)
	exams.Post("/:id/results", examsHandler.EnterResults)
	exams.Get("/:id/results", examsHandler.ListResults)

	// Assessments
	assessmentsHandler := handlers.NewAssessmentsHandler(db)

	assessments := api.Group("/assessments", middleware.AuthRequired(), middleware.RequireRole("admin"))
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
}
