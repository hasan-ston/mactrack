package pkg

import (
	"database/sql"
	"fmt"
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

// TestSearchCourses_MultiToken exercises the multi-token AND search that was
// added in the pagination PR. "ZZTEST Data" must match a row whose subject
// contains "ZZTEST" AND whose course_name contains "Data", while "ZZTEST
// Nonexistent" should return zero results because only one token matches.
func TestSearchCourses_MultiToken(t *testing.T) {
	repo := newTestRepo(t)
	defer repo.Close()

	// Seed three courses in the same subject but with different names.
	for _, c := range []struct{ num, name string }{
		{"100X", "Data Structures"},
		{"200X", "Algorithms"},
		{"300X", "Data Science"},
	} {
		_, err := repo.DB.Exec(
			`INSERT INTO courses(subject, course_number, course_name, professor, term)
			 VALUES ('ZZTEST', ?, ?, 'Dr X', '2025')`, c.num, c.name)
		if err != nil {
			t.Fatalf("seed %s: %v", c.num, err)
		}
	}

	t.Run("two-token AND matches subset", func(t *testing.T) {
		out, total, err := repo.SearchCourses("ZZTEST Data", 0, 0)
		if err != nil {
			t.Fatalf("SearchCourses: %v", err)
		}
		// "Data Structures" and "Data Science" match; "Algorithms" does not.
		if total != 2 {
			t.Fatalf("expected total=2, got %d", total)
		}
		if len(out) != 2 {
			t.Fatalf("expected 2 results, got %d", len(out))
		}
	})

	t.Run("two-token AND with no overlap returns 0", func(t *testing.T) {
		out, total, err := repo.SearchCourses("ZZTEST Nonexistent", 0, 0)
		if err != nil {
			t.Fatalf("SearchCourses: %v", err)
		}
		if total != 0 {
			t.Fatalf("expected total=0, got %d", total)
		}
		if len(out) != 0 {
			t.Fatalf("expected 0 results, got %d", len(out))
		}
	})

	t.Run("single token still works", func(t *testing.T) {
		_, total, err := repo.SearchCourses("Algorithms", 0, 0)
		if err != nil {
			t.Fatalf("SearchCourses: %v", err)
		}
		if total != 1 {
			t.Fatalf("expected total=1, got %d", total)
		}
	})
}

// TestSearchCourses_Pagination verifies that limit and offset control the
// result window while total always reflects the full match count.
func TestSearchCourses_Pagination(t *testing.T) {
	repo := newTestRepo(t)
	defer repo.Close()

	// Seed 5 courses
	for i := 1; i <= 5; i++ {
		_, err := repo.DB.Exec(
			`INSERT INTO courses(subject, course_number, course_name, professor, term)
			 VALUES ('PAGE', ?, 'Course', 'Dr X', '2025')`, fmt.Sprintf("%dXX", i))
		if err != nil {
			t.Fatalf("seed course %d: %v", i, err)
		}
	}

	t.Run("limit=2 offset=0 returns first 2, total=5", func(t *testing.T) {
		out, total, err := repo.SearchCourses("PAGE", 2, 0)
		if err != nil {
			t.Fatalf("SearchCourses: %v", err)
		}
		if total != 5 {
			t.Fatalf("expected total=5, got %d", total)
		}
		if len(out) != 2 {
			t.Fatalf("expected 2 results, got %d", len(out))
		}
	})

	t.Run("limit=2 offset=3 returns 2 remaining", func(t *testing.T) {
		out, total, err := repo.SearchCourses("PAGE", 2, 3)
		if err != nil {
			t.Fatalf("SearchCourses: %v", err)
		}
		if total != 5 {
			t.Fatalf("expected total=5, got %d", total)
		}
		if len(out) != 2 {
			t.Fatalf("expected 2 results, got %d", len(out))
		}
	})

	t.Run("limit=2 offset=4 returns last 1", func(t *testing.T) {
		out, total, err := repo.SearchCourses("PAGE", 2, 4)
		if err != nil {
			t.Fatalf("SearchCourses: %v", err)
		}
		if total != 5 {
			t.Fatalf("expected total=5, got %d", total)
		}
		if len(out) != 1 {
			t.Fatalf("expected 1 result, got %d", len(out))
		}
	})

	t.Run("offset past end returns 0 results, total still 5", func(t *testing.T) {
		out, total, err := repo.SearchCourses("PAGE", 10, 10)
		if err != nil {
			t.Fatalf("SearchCourses: %v", err)
		}
		if total != 5 {
			t.Fatalf("expected total=5, got %d", total)
		}
		if len(out) != 0 {
			t.Fatalf("expected 0 results, got %d", len(out))
		}
	})
}
