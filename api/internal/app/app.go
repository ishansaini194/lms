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
	authHandler := handlers.NewAuthHandler(db)

	api := srv.App.Group("/api")

	// Public routes
	api.Post("/login", authHandler.Login)

	// Protected routes
	authGroup := api.Group("/auth", middleware.AuthRequired())
	authGroup.Post("/change-password", authHandler.ChangePassword)
	authGroup.Post("/reset-password/:id", authHandler.ResetPassword)
}
