package main

import (
	"database/sql"
	"fmt"
	"log"
	"os"
	"regexp"
	"strings"

	_ "github.com/mattn/go-sqlite3"
)

// courseRow holds the data we need from each course record
type courseRow struct {
	id        int
	professor string
}

func main() {
	dbPath := os.Getenv("MACTRACK_DB")
	if dbPath == "" {
		dbPath = "database/courses.db"
	}

	// Open the SQLite database
	db, err := sql.Open("sqlite3", dbPath)
	if err != nil {
		log.Fatalf("Failed to open database: %v", err)
	}
	defer db.Close()

	rows, err := db.Query("SELECT id, professor FROM courses WHERE professor IS NOT NULL AND professor != ''")
	if err != nil {
		log.Fatalf("Failed to query courses: %v", err)
	}

	// Collect all rows into a slice
	var courses []courseRow
	for rows.Next() {
		var r courseRow
		if err := rows.Scan(&r.id, &r.professor); err != nil {
			log.Printf("Error scanning row: %v", err)
			continue
		}
		courses = append(courses, r)
	}

	rows.Close()

	if err := rows.Err(); err != nil {
		log.Fatalf("Row iteration error: %v", err)
	}

	splitRegex := regexp.MustCompile(`[,\n\r]+`)

	for _, course := range courses {
		// Split the raw professor string into individual names
		rawNames := splitRegex.Split(course.professor, -1)

		// Track instructors added to THIS course to prevent duplicate links
		seenForCourse := make(map[string]bool)

		for _, rawName := range rawNames {
			name := strings.TrimSpace(rawName)

			if name == "" || strings.ToLower(name) == "staff" || strings.ToLower(name) == "tba" {
				continue
			}

			normalizedName := strings.ToLower(name)

			if seenForCourse[normalizedName] {
				continue
			}
			seenForCourse[normalizedName] = true

			_, err := db.Exec(`
				INSERT OR IGNORE INTO instructors (name, name_normalized) 
				VALUES (?, ?)`,
				name, normalizedName,
			)
			if err != nil {
				log.Printf("Error inserting instructor %s: %v", name, err)
				continue
			}

			var instructorID int
			err = db.QueryRow(
				`SELECT instructor_id FROM instructors WHERE name_normalized = ?`,
				normalizedName,
			).Scan(&instructorID)
			if err != nil {
				log.Printf("Error fetching instructor_id for %s: %v", name, err)
				continue
			}

			_, err = db.Exec(`
				INSERT OR IGNORE INTO course_instructors (course_row_id, instructor_id) 
				VALUES (?, ?)`,
				course.id, instructorID,
			)
			if err != nil {
				log.Printf("Error linking instructor %s to course %d: %v", name, course.id, err)
			}
		}
	}

	fmt.Println("Successfully populated instructors and course_instructors tables!")
}
