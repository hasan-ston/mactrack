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

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/stdlib"
	"github.com/joho/godotenv"
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
	// Load .env if present
	_ = godotenv.Load()

	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		dsn = os.Getenv("MACTRACK_DB")
	}
	if dsn == "" {
		dsn = "database/courses.db"
	}

	isPostgres := strings.HasPrefix(dsn, "postgres://") ||
		strings.HasPrefix(dsn, "postgresql://") ||
		strings.Contains(dsn, "host=")

	var db *sql.DB
	if isPostgres {
		cfg, err := pgx.ParseConfig(dsn)
		if err != nil {
			log.Fatalf("Failed to parse postgres DSN: %v", err)
		}
		// Simple protocol — required for Supabase PgBouncer (transaction mode)
		cfg.DefaultQueryExecMode = pgx.QueryExecModeSimpleProtocol
		db = stdlib.OpenDB(*cfg)
	} else {
		var err error
		db, err = sql.Open("sqlite3", dsn)
		if err != nil {
			log.Fatalf("Failed to open database: %v", err)
		}
	}
	defer db.Close()

	if err := db.Ping(); err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	log.Printf("Connected to database (postgres=%v)", isPostgres)

	rmpData, err := loadRMPData("rmp.json")
	if err != nil {
		log.Fatalf("Failed to load RMP data: %v", err)
	}

	instructorCount, _, err := seedInstructors(db, rmpData, isPostgres)
	if err != nil {
		log.Fatalf("Failed to seed instructors: %v", err)
	}

	linkCount, err := linkInstructorsToCourses(db, isPostgres)
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

func seedInstructors(db *sql.DB, instructors []RMPInstructor, isPostgres bool) (int, int, error) {
	var insertStmt string
	if isPostgres {
		insertStmt = `
			INSERT INTO instructors (
				name, name_normalized, department,
				external_source, external_id, external_url,
				ext_avg_rating, ext_avg_difficulty, ext_num_ratings
			) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
			ON CONFLICT (name_normalized) DO UPDATE SET
				department        = EXCLUDED.department,
				external_source   = EXCLUDED.external_source,
				external_id       = EXCLUDED.external_id,
				external_url      = EXCLUDED.external_url,
				ext_avg_rating    = EXCLUDED.ext_avg_rating,
				ext_avg_difficulty= EXCLUDED.ext_avg_difficulty,
				ext_num_ratings   = EXCLUDED.ext_num_ratings
		`
	} else {
		insertStmt = `
			INSERT OR REPLACE INTO instructors (
				name, name_normalized, department,
				external_source, external_id, external_url,
				ext_avg_rating, ext_avg_difficulty, ext_num_ratings
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
		`
	}

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

func linkInstructorsToCourses(db *sql.DB, isPostgres bool) (int, error) {
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

	var exactSQL, fuzzySQL string
	if isPostgres {
		exactSQL = `
			INSERT INTO course_instructors (course_row_id, instructor_id)
			SELECT $1, instructor_id FROM instructors WHERE name_normalized = $2
			ON CONFLICT DO NOTHING
		`
		fuzzySQL = `
			INSERT INTO course_instructors (course_row_id, instructor_id)
			SELECT $1, instructor_id FROM instructors
			WHERE (
				substr(name_normalized, strpos(name_normalized, ' ') + 1) = $2
				OR name_normalized ILIKE $3
			)
			AND (
				split_part(name_normalized, ' ', 1) = $4
				OR left(name_normalized, 1) = $5
			)
			LIMIT 1
			ON CONFLICT DO NOTHING
		`
	} else {
		exactSQL = `
			INSERT OR IGNORE INTO course_instructors (course_row_id, instructor_id)
			SELECT ?, instructor_id FROM instructors WHERE name_normalized = ?
		`
		fuzzySQL = `
			INSERT OR IGNORE INTO course_instructors (course_row_id, instructor_id)
			SELECT ?, instructor_id FROM instructors
			WHERE (
				substr(name_normalized, instr(name_normalized, ' ') + 1) = ?
				OR name_normalized LIKE ?
			)
			AND (
				substr(name_normalized, 1, instr(name_normalized, ' ') - 1) = ?
				OR substr(name_normalized, 1, 1) = ?
			)
			LIMIT 1
		`
	}

	exactStmt, err := db.Prepare(exactSQL)
	if err != nil {
		return 0, fmt.Errorf("prepare exact: %w", err)
	}
	defer exactStmt.Close()

	fuzzyStmt, err := db.Prepare(fuzzySQL)
	if err != nil {
		return 0, fmt.Errorf("prepare fuzzy: %w", err)
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
