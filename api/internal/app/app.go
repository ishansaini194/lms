package app

import (
	"github.com/ishansaini194/lms/api/internal/database"
	"github.com/ishansaini194/lms/api/internal/server"
)

func New() (*server.Server, error) {
	db, err := database.Connect()
	if err != nil {
		return nil, err
	}

	srv := server.New(db)

	return srv, nil
}
