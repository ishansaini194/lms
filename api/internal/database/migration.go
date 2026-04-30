package database

import (
	"log"

	"gorm.io/gorm"
)

func Run(db *gorm.DB) {
	err := db.AutoMigrate()
	if err != nil {
		log.Fatal("Migration failed:", err)
	}
	log.Println("All migrations done")

}
