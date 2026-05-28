package server

import (
	"os"

	"github.com/gofiber/fiber/v2"
	"gorm.io/gorm"
)

type Server struct {
	App *fiber.App
	DB  *gorm.DB
}

func New(db *gorm.DB) *Server {
	app := fiber.New(fiber.Config{
		BodyLimit: 26 * 1024 * 1024, // 26 MB — allows 25MB library uploads
	})

	return &Server{
		App: app,
		DB:  db,
	}
}

func (s *Server) Start() error {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	return s.App.Listen(":" + port)
}
