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

	// Classes (Delete + Reorder deferred until class_years exists — done now, so add them)
	classHandler := handlers.NewClassHandler(db)

	classes := api.Group("/classes", middleware.AuthRequired(), middleware.RequireRole("admin"))
	classes.Get("/", classHandler.List)
	classes.Get("/:id", classHandler.GetOne)
	classes.Post("/", classHandler.Create)
	classes.Put("/:id", classHandler.Update)
	// classes.Put("/reorder", classHandler.Reorder)   // not built yet — uncomment when ready
	// classes.Delete("/:id", classHandler.Delete)    // not built yet — uncomment when ready

	// Class Years
	classYearHandler := handlers.NewClassYearHandler(db)

	classYears := api.Group("/class-years", middleware.AuthRequired(), middleware.RequireRole("admin"))
	classYears.Get("/", classYearHandler.List)
	classYears.Get("/:id", classYearHandler.GetOne)
	classYears.Post("/", classYearHandler.Create)
	classYears.Put("/:id", classYearHandler.Update)
	classYears.Delete("/:id", classYearHandler.Delete)
}
