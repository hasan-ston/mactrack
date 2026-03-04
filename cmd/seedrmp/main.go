package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	_ "github.com/mattn/go-sqlite3"
)

type RMPInstructor struct {
	ID                    string  `json:"id"`
	FirstName             string  `json:"first_name"`
	LastName              string  `json:"last_name"`
	School                string  `json:"school"`
	SchoolID              string  `json:"school_id"`
	AvgRating             float64 `json:"avg_rating"`
	NumRatings            int     `json:"num_ratings"`
	Department            string  `json:"department"`
	WouldTakeAgainPercent float64 `json:"would_take_again_percent"`
	AvgDifficulty         float64 `json:"avg_difficulty"`
}

func main() {
	dbPath := os.Getenv("MACTRACK_DB")
	if dbPath == "" {
		dbPath = "database/courses.db"
	}

	db, err := sql.Open("sqlite3", dbPath)
	if err != nil {
		log.Fatalf("Failed to open database: %v", err)
	}
	defer db.Close()

	if err := db.Ping(); err != nil {
		log.Fatalf("Failed to ping database: %v", err)
	}

	rmpData, err := loadRMPData("rmp.json")
	if err != nil {
		log.Fatalf("Failed to load RMP data: %v", err)
	}

	instructorCount, linkCount, err := seedInstructors(db, rmpData)
	if err != nil {
		log.Fatalf("Failed to seed instructors: %v", err)
	}

	linkCount, err = linkInstructorsToCourses(db)
	if err != nil {
		log.Fatalf("Failed to link instructors to courses: %v", err)
	}

	fmt.Printf("Seeded %d instructors from RMP data\n", instructorCount)
	fmt.Printf("Linked %d instructor-course relationships\n", linkCount)
}

func loadRMPData(path string) ([]RMPInstructor, error) {
	absPath, err := filepath.Abs(path)
	if err != nil {
		return nil, fmt.Errorf("failed to get absolute path: %w", err)
	}

	data, err := os.ReadFile(absPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read file: %w", err)
	}

	var instructors []RMPInstructor
	if err := json.Unmarshal(data, &instructors); err != nil {
		return nil, fmt.Errorf("failed to parse JSON: %w", err)
	}

	return instructors, nil
}

func extractNumericID(base64ID string) string {
	re := regexp.MustCompile(`\d+`)
	matches := re.FindAllString(base64ID, -1)
	if len(matches) > 0 {
		return matches[len(matches)-1]
	}
	return ""
}

func seedInstructors(db *sql.DB, instructors []RMPInstructor) (int, int, error) {
	insertStmt := `
		INSERT OR REPLACE INTO instructors (
			name, name_normalized, department,
			external_source, external_id, external_url,
			ext_avg_rating, ext_avg_difficulty, ext_num_ratings
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
	`

	count := 0
	tx, err := db.Begin()
	if err != nil {
		return 0, 0, err
	}
	defer tx.Rollback()

	stmt, err := tx.Prepare(insertStmt)
	if err != nil {
		return 0, 0, err
	}
	defer stmt.Close()

	for _, inst := range instructors {
		name := strings.TrimSpace(inst.FirstName + " " + inst.LastName)
		nameNormalized := strings.ToLower(name)
		numericID := extractNumericID(inst.ID)

		var extURL string
		if numericID != "" {
			extURL = "https://www.ratemyprofessors.com/professor/" + numericID
		}

		_, err := stmt.Exec(
			name,
			nameNormalized,
			inst.Department,
			"rmp",
			inst.ID,
			extURL,
			inst.AvgRating,
			inst.AvgDifficulty,
			inst.NumRatings,
		)
		if err != nil {
			log.Printf("Error inserting instructor %s: %v", name, err)
			continue
		}
		count++
	}

	if err := tx.Commit(); err != nil {
		return 0, 0, err
	}

	return count, 0, nil
}

func linkInstructorsToCourses(db *sql.DB) (int, error) {
	type courseProf struct {
		ID        int
		Professor string
	}

	rows, err := db.Query("SELECT id, professor FROM courses WHERE professor IS NOT NULL AND professor != ''")
	if err != nil {
		return 0, err
	}
	defer rows.Close()

	var courses []courseProf
	for rows.Next() {
		var c courseProf
		if err := rows.Scan(&c.ID, &c.Professor); err != nil {
			log.Printf("Error scanning course: %v", err)
			continue
		}
		courses = append(courses, c)
	}

	splitRegex := regexp.MustCompile(`[,\n\r]+`)

	// Exact match by full normalized name
	exactStmt, err := db.Prepare(`
		INSERT OR IGNORE INTO course_instructors (course_row_id, instructor_id)
		SELECT ?, instructor_id FROM instructors WHERE name_normalized = ?
	`)
	if err != nil {
		return 0, err
	}
	defer exactStmt.Close()

	// Fuzzy: match by last name where there's exactly one instructor with that last name
	// This catches "Kee Howe Yong" matching "Kee Yong" (last name = yong)
	fuzzyStmt, err := db.Prepare(`
		INSERT OR IGNORE INTO course_instructors (course_row_id, instructor_id)
		SELECT ?, instructor_id FROM instructors
		WHERE (
			-- last word in the normalized name matches the course professor's last word
			substr(name_normalized, instr(name_normalized, ' ') + 1) = ?
			OR name_normalized LIKE ? 
		)
		AND (
			-- first name/initial also matches to avoid false positives
			substr(name_normalized, 1, instr(name_normalized, ' ') - 1) = ?
			OR substr(name_normalized, 1, 1) = ?
		)
		LIMIT 1
	`)
	if err != nil {
		return 0, err
	}
	defer fuzzyStmt.Close()

	count := 0
	tx, err := db.Begin()
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()

	for _, course := range courses {
		rawNames := splitRegex.Split(course.Professor, -1)
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

			// Try exact match first
			result, err := tx.Stmt(exactStmt).Exec(course.ID, normalizedName)
			if err != nil {
				log.Printf("Error linking instructor %s to course %d: %v", name, course.ID, err)
				continue
			}
			rowsAffected, _ := result.RowsAffected()
			if rowsAffected > 0 {
				count++
				continue
			}

			// Exact match failed — try fuzzy matching by last name + first initial
			parts := strings.Fields(normalizedName)
			if len(parts) < 2 {
				continue
			}
			firstName := parts[0]
			lastName := parts[len(parts)-1]
			firstInitial := string(firstName[0])
			lastNameLike := "%" + lastName

			result, err = tx.Stmt(fuzzyStmt).Exec(course.ID, lastName, lastNameLike, firstName, firstInitial)
			if err != nil {
				log.Printf("Error fuzzy-linking instructor %s to course %d: %v", name, course.ID, err)
				continue
			}
			rowsAffected, _ = result.RowsAffected()
			if rowsAffected > 0 {
				count++
			}
		}
	}

	if err := tx.Commit(); err != nil {
		return 0, err
	}

	return count, nil
}
