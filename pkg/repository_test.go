package pkg

import (
	"database/sql"
	"os"
	"path/filepath"
	"testing"

	_ "github.com/mattn/go-sqlite3"
)

// sets up a test database using the DDL-only schema fixture.
// We deliberately do NOT load the bulk-seed migrations (000_baseline.sql
// has 29 000+ lines of INSERT statements) so that each test starts in
// milliseconds even under -race/-cover.
func newTestRepo(t *testing.T) *Repository {
	t.Helper()
	db, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		t.Fatalf("open db: %v", err)
	}

	schemaPath := filepath.Join("..", "migrations", "schema_test.sql")
	b, err := os.ReadFile(schemaPath)
	if err != nil {
		db.Close()
		t.Fatalf("read schema_test.sql: %v", err)
	}
	if _, err := db.Exec(string(b)); err != nil {
		db.Close()
		t.Fatalf("exec schema_test.sql: %v", err)
	}

	return &Repository{DB: db}
}

func TestSearchCourses_GetCourseByID_GetRequisites_GetPlanItems(t *testing.T) {
	repo := newTestRepo(t)
	defer repo.Close()

	// add a test user
	res, err := repo.DB.Exec(`INSERT INTO users(email, display_name, password_hash) VALUES (?, ?, ?)`, "test@example.com", "Test User", "x")
	if err != nil {
		t.Fatalf("insert user: %v", err)
	}
	userID, _ := res.LastInsertId()

	// add a test course
	res, err = repo.DB.Exec(`INSERT INTO courses(subject, course_number, course_name, professor, term) VALUES (?, ?, ?, ?, ?)`, "ZZTEST", "100X", "Test Course", "Dr X", "2025")
	if err != nil {
		t.Fatalf("insert course: %v", err)
	}
	courseID, _ := res.LastInsertId()

	// add a prereq for the test course
	_, err = repo.DB.Exec(`INSERT INTO requisites(subject, course_number, req_subject, req_course_number, kind) VALUES (?, ?, 'MATH', '1A01', 'PREREQ')`, "ZZTEST", "100X")
	if err != nil {
		t.Fatalf("insert requisite: %v", err)
	}

	// add a plan term and item for the user
	res, err = repo.DB.Exec(`INSERT INTO plan_terms(user_id, year_index, season) VALUES (?, ?, ?)`, userID, 1, "Fall")
	if err != nil {
		t.Fatalf("insert plan_term: %v", err)
	}
	planTermID, _ := res.LastInsertId()

	_, err = repo.DB.Exec(`INSERT INTO plan_items(plan_term_id, subject, course_number, status) VALUES (?, ?, ?, 'PLANNED')`, planTermID, "ZZTEST", "100X")
	if err != nil {
		t.Fatalf("insert plan_item: %v", err)
	}

	t.Run("SearchCourses finds by subject", func(t *testing.T) {
		// limit=0 means no cap; offset=0
		out, total, err := repo.SearchCourses("ZZTEST", 0, 0)
		if err != nil {
			t.Fatalf("SearchCourses: %v", err)
		}
		if total != 1 {
			t.Fatalf("expected total=1, got %d", total)
		}
		if len(out) != 1 {
			t.Fatalf("expected 1 result, got %d", len(out))
		}
		if out[0].Subject != "ZZTEST" || out[0].CourseNumber != "100X" {
			t.Fatalf("unexpected row: %+v", out[0])
		}
	})

	t.Run("GetCourseByID happy + not found", func(t *testing.T) {
		c, err := repo.GetCourseByID(int(courseID))
		if err != nil {
			t.Fatalf("GetCourseByID: %v", err)
		}
		if c == nil || c.Subject != "ZZTEST" {
			t.Fatalf("unexpected course: %+v", c)
		}

		c2, err := repo.GetCourseByID(9999)
		if err != nil {
			t.Fatalf("GetCourseByID missing: %v", err)
		}
		if c2 != nil {
			t.Fatalf("expected nil, got %+v", c2)
		}
	})

	t.Run("GetRequisites returns PREREQ rows", func(t *testing.T) {
		reqs, err := repo.GetRequisites("ZZTEST", "100X")
		if err != nil {
			t.Fatalf("GetRequisites: %v", err)
		}
		if len(reqs) != 1 {
			t.Fatalf("expected 1 requisite, got %d", len(reqs))
		}
		if reqs[0].Kind != "PREREQ" || reqs[0].ReqSubject != "MATH" {
			t.Fatalf("unexpected requisite: %+v", reqs[0])
		}
	})

	t.Run("GetPlanItems returns items for user", func(t *testing.T) {
		items, err := repo.GetPlanItems(int(userID))
		if err != nil {
			t.Fatalf("GetPlanItems: %v", err)
		}
		if len(items) != 1 {
			t.Fatalf("expected 1 plan item, got %d", len(items))
		}
		if items[0].Subject != "ZZTEST" {
			t.Fatalf("unexpected plan item: %+v", items[0])
		}
	})
}
