package main

import (
	"log"

	"github.com/ishansaini194/lms/api/internal/app"
	"github.com/joho/godotenv"
)

func main() {
	if err := godotenv.Load(); err != nil {
		log.Println("no .env file found, using system env")
	}

	srv, err := app.New()
	if err != nil {
		log.Fatal("failed to start app:", err)
	}

	if err := srv.Start(); err != nil {
		log.Fatal("server failed:", err)
	}
}
