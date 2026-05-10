package main

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/ishansaini194/lms/api/internal/database"
	"github.com/joho/godotenv"
)

func main() {
	if err := godotenv.Load(); err != nil {
		log.Println("no .env file found, using system env")
	}

	db, err := database.Connect()
	if err != nil {
		log.Fatal("failed to connect to database:", err)
	}

	files, err := filepath.Glob("migrations/*.sql")
	if err != nil {
		log.Fatal("failed to read migrations folder:", err)
	}

	if len(files) == 0 {
		log.Fatal("no migration files found in migrations/")
	}

	sort.Strings(files)

	for _, file := range files {
		fmt.Printf("Running migration: %s\n", file)

		content, err := os.ReadFile(file)
		if err != nil {
			log.Fatalf("failed to read %s: %v", file, err)
		}

		sql := strings.TrimSpace(string(content))
		if sql == "" {
			fmt.Println("  empty file, skipping")
			continue
		}

		if err := db.Exec(sql).Error; err != nil {
			log.Fatalf("migration failed for %s: %v", file, err)
		}

		fmt.Printf("  ✓ done\n")
	}

	fmt.Println("\nAll migrations completed successfully!")
}
