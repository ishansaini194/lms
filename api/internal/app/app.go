package app

import (
	"github.com/ishansaini194/lms/api/internal/database"
	"github.com/ishansaini194/lms/api/internal/server"
)

func New() *server.Server {
	database.Connect()
	database.Run(database.DB)

	srv := server.New()

	return srv
}
