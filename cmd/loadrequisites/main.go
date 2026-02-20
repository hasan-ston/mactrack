package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"

	_ "github.com/mattn/go-sqlite3"
)

// Requisite matches the expected JSON structure from the scraper
type Requisite struct {
	Subject         string `json:"subject"`
	CourseNumber    string `json:"course_number"`
	ReqSubject      string `json:"req_subject"`
	ReqCourseNumber string `json:"req_course_number"`
	Kind            string `json:"kind"` // "PREREQ", "COREQ", or "ANTIREQ"
	Note            string `json:"note,omitempty"`
}

func main() {
	// 1. Database Connection (using the absolute path trick that worked last time)
	dbPath := "../../database/courses.db"
	absDBPath, err := filepath.Abs(dbPath)
	if err != nil {
		log.Fatalf("Error resolving DB path: %v", err)
	}

	if _, err := os.Stat(absDBPath); os.IsNotExist(err) {
		log.Fatalf("❌ STOP: The database file does NOT exist at %s.", absDBPath)
	}

	db, err := sql.Open("sqlite3", absDBPath)
	if err != nil {
		log.Fatalf("Failed to open database: %v", err)
	}
	defer db.Close()

	// 2. Read the Scraped JSON Data
	// Assuming the scraper saves a file called scraped_requisites.json in the same folder
	jsonPath := "scraped_requisites.json"
	fileData, err := os.ReadFile(jsonPath)
	if err != nil {
		log.Fatalf("❌ Failed to read JSON file. Does '%s' exist in this folder? Error: %v", jsonPath, err)
	}

	var reqs []Requisite
	if err := json.Unmarshal(fileData, &reqs); err != nil {
		log.Fatalf("Failed to parse JSON: %v", err)
	}

	// 3. Insert into the requisites table
	successCount := 0
	for _, req := range reqs {
		// The schema requires Kind to be PREREQ, COREQ, or ANTIREQ.
		_, err := db.Exec(`
			INSERT INTO requisites (subject, course_number, req_subject, req_course_number, kind, note)
			VALUES (?, ?, ?, ?, ?, ?)
		`, req.Subject, req.CourseNumber, req.ReqSubject, req.ReqCourseNumber, req.Kind, req.Note)

		if err != nil {
			log.Printf("Warning: Failed to insert requisite for %s %s: %v", req.Subject, req.CourseNumber, err)
			continue
		}
		successCount++
	}

	fmt.Printf("✅ Successfully loaded %d requisites into the database!\n", successCount)
}