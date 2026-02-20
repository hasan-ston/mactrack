package pkg

import (
	"database/sql"
	"fmt"

	_ "github.com/mattn/go-sqlite3"
)

type Repository struct {
	DB *sql.DB
}

// NewRepository opens the SQLite database at the given path.
func NewRepository(dbPath string) (*Repository, error) {
	db, err := sql.Open("sqlite3", dbPath)
	if err != nil {
		return nil, err
	}
	// Simple ping to validate
	if err := db.Ping(); err != nil {
		db.Close()
		return nil, fmt.Errorf("cannot connect to db: %w", err)
	}
	return &Repository{DB: db}, nil
}

// SearchCourses searches courses by subject, number, name, or professor.
func (r *Repository) SearchCourses(q string) ([]Course, error) {
	var rows *sql.Rows
	var err error

	if q == "" {
		// No search query — return all courses, no limit
		rows, err = r.DB.Query(`
			SELECT id, subject, course_number, course_name, professor, term
			FROM courses
			ORDER BY subject, course_number`)
	} else {
		// Search query — limit to 200 results to keep responses fast
		pattern := "%" + q + "%"
		rows, err = r.DB.Query(`
			SELECT id, subject, course_number, course_name, professor, term
			FROM courses
			WHERE subject LIKE ? OR course_number LIKE ? OR course_name LIKE ? OR professor LIKE ?
			ORDER BY subject, course_number
			LIMIT 200`, pattern, pattern, pattern, pattern)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []Course{}
	for rows.Next() {
		var c Course
		var courseName, professor sql.NullString
		if err := rows.Scan(&c.ID, &c.Subject, &c.CourseNumber, &courseName, &professor, &c.Term); err != nil {
			return nil, err
		}
		c.CourseName = courseName.String
		c.Professor = professor.String
		out = append(out, c)
	}
	return out, rows.Err()
}

// GetCourseByID fetches a single course by id.
func (r *Repository) GetCourseByID(id int) (*Course, error) {
	row := r.DB.QueryRow(`SELECT id, subject, course_number, course_name, professor, term FROM courses WHERE id = ?`, id)
	var c Course
	var courseName, professor sql.NullString
	if err := row.Scan(&c.ID, &c.Subject, &c.CourseNumber, &courseName, &professor, &c.Term); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	c.CourseName = courseName.String
	c.Professor = professor.String
	return &c, nil
}

// Close closes the underlying DB connection.
func (r *Repository) Close() error {
	if r.DB != nil {
		return r.DB.Close()
	}
	return nil
}
