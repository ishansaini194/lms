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
		BodyLimit:               26 * 1024 * 1024, // 26 MB — allows 25MB library uploads
		ProxyHeader:             fiber.HeaderXForwardedFor,
		EnableTrustedProxyCheck: true,
		TrustedProxies: []string{
			"127.0.0.1",
			"172.16.0.0/12", // Docker bridge range (gateway currently 172.19.0.1)
		},
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
