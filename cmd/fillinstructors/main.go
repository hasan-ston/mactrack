package main

import (
	"database/sql"
	"fmt"
	"log"
	"regexp"
	"strings"

	_ "github.com/mattn/go-sqlite3"
)

func main() {
	dbPath := "../../database/courses.db" 

	db, err := sql.Open("sqlite3", dbPath)
	if err != nil {
		log.Fatalf("Failed to open database: %v", err)
	}
	defer db.Close()

	// 1. Fetch all courses that have a professor listed
	rows, err := db.Query("SELECT id, professor FROM courses WHERE professor IS NOT NULL AND professor != ''")
	if err != nil {
		log.Fatalf("Failed to query courses: %v", err)
	}
	defer rows.Close()

	// Regex to split by commas, newlines, or carriage returns
	splitRegex := regexp.MustCompile(`[,\n\r]+`)

	for rows.Next() {
		var courseID int
		var profString string
		if err := rows.Scan(&courseID, &profString); err != nil {
			log.Printf("Error scanning row: %v", err)
			continue
		}

		// Split the raw string into individual names
		rawNames := splitRegex.Split(profString, -1)
		
		// Track instructors added to THIS course to prevent duplicate links
		seenForCourse := make(map[string]bool)

		for _, rawName := range rawNames {
			name := strings.TrimSpace(rawName)
			
			// Skip empty strings and placeholders
			if name == "" || strings.ToLower(name) == "staff" || strings.ToLower(name) == "tba" {
				continue
			}

			// Normalize the name (lowercase) for the unique constraint
			normalizedName := strings.ToLower(name)

			if seenForCourse[normalizedName] {
				continue // Already processed this prof for this course
			}
			seenForCourse[normalizedName] = true

			// 2. Insert into instructors (IGNORE if it already exists)
			_, err := db.Exec(`
				INSERT OR IGNORE INTO instructors (name, name_normalized) 
				VALUES (?, ?)`, 
				name, normalizedName,
			)
			if err != nil {
				log.Printf("Error inserting instructor %s: %v", name, err)
				continue
			}

			// 3. Fetch the instructor_id (whether we just inserted it or it already existed)
			var instructorID int
			err = db.QueryRow(`SELECT instructor_id FROM instructors WHERE name_normalized = ?`, normalizedName).Scan(&instructorID)
			if err != nil {
				log.Printf("Error fetching instructor_id for %s: %v", name, err)
				continue
			}

			// 4. Link the course and instructor
			_, err = db.Exec(`
				INSERT OR IGNORE INTO course_instructors (course_row_id, instructor_id) 
				VALUES (?, ?)`,
				courseID, instructorID,
			)
			if err != nil {
				log.Printf("Error linking instructor %s to course %d: %v", name, courseID, err)
			}
		}
	}

	if err := rows.Err(); err != nil {
		log.Fatalf("Row iteration error: %v", err)
	}

	fmt.Println("Successfully populated instructors and course_instructors tables!")
}