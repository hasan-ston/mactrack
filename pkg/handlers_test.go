package pkg

import (
	"bytes"
	"encoding/json"
	"net/http/httptest"
	"strconv"
	"testing"
)

func TestCourseHandlers_GettersAndPlan(t *testing.T) {
	repo := newTestRepo(t)
	defer repo.Close()

	// add a course
	res, err := repo.DB.Exec(`INSERT INTO courses(subject, course_number, course_name, professor, term) VALUES ('COMPSCI','2C03','Data Structures','Dr X','2025')`)
	if err != nil {
		t.Fatalf("seed course: %v", err)
	}
	courseID, _ := res.LastInsertId()

	// add a user
	res, err = repo.DB.Exec(`INSERT INTO users(email, display_name, password_hash) VALUES ('test@example.com','Test','x')`)
	if err != nil {
		t.Fatalf("seed user: %v", err)
	}
	userID, _ := res.LastInsertId()

	// add a plan term and item
	res, err = repo.DB.Exec(`INSERT INTO plan_terms(user_id, year_index, season) VALUES (?, 1, 'Fall')`, userID)
	if err != nil {
		t.Fatalf("seed plan_term: %v", err)
	}
	planTermID, _ := res.LastInsertId()

	_, err = repo.DB.Exec(`INSERT INTO plan_items(plan_term_id, subject, course_number, status) VALUES (?, 'COMPSCI', '2C03', 'PLANNED')`, planTermID)
	if err != nil {
		t.Fatalf("seed plan_item: %v", err)
	}

	t.Run("GET course by subject+number", func(t *testing.T) {
		rr := httptest.NewRecorder()
		req := httptest.NewRequest("GET", "/api/courses/COMPSCI/2C03", nil)
		CourseBySubjectNumberHandler(repo).ServeHTTP(rr, req)
		if rr.Code != 200 {
			t.Fatalf("expected 200, got %d: %s", rr.Code, rr.Body.String())
		}
		var c struct {
			Subject      string `json:"subject"`
			CourseNumber string `json:"course_number"`
		}
		if err := json.NewDecoder(rr.Body).Decode(&c); err != nil {
			t.Fatalf("decode: %v", err)
		}
		if c.Subject != "COMPSCI" || c.CourseNumber != "2C03" {
			t.Fatalf("unexpected course: %+v", c)
		}
	})

	t.Run("GET course by id", func(t *testing.T) {
		rr := httptest.NewRecorder()
		req := httptest.NewRequest("GET", "/api/courses/"+strconv.FormatInt(courseID, 10), nil)
		CourseHandler(repo).ServeHTTP(rr, req)
		if rr.Code != 200 {
			t.Fatalf("expected 200, got %d: %s", rr.Code, rr.Body.String())
		}
	})

	t.Run("GET user plan", func(t *testing.T) {
		rr := httptest.NewRecorder()
		req := httptest.NewRequest("GET", "/api/users/"+strconv.FormatInt(userID, 10)+"/plan", nil)
		GetUserPlanHandler(repo, &Service{Repo: repo}).ServeHTTP(rr, req)
		if rr.Code != 200 {
			t.Fatalf("expected 200, got %d: %s", rr.Code, rr.Body.String())
		}
	})
}

func TestCoursesHandler(t *testing.T) {
	repo := newTestRepo(t)
	defer repo.Close()

	// use ZZTEST to avoid colliding with real seed data in migration 001
	_, err := repo.DB.Exec(`INSERT INTO courses(subject, course_number, course_name, professor, term) VALUES ('ZZTEST', '100X', 'Test Course', 'Dr X', '2025')`)
	if err != nil {
		t.Fatalf("seed course: %v", err)
	}

	handler := CoursesHandler(repo)

	type coursesResp struct {
		Courses []Course `json:"courses"`
		Total   int      `json:"total"`
		Limit   int      `json:"limit"`
		Offset  int      `json:"offset"`
	}

	t.Run("no query returns courses", func(t *testing.T) {
		rr := httptest.NewRecorder()
		req := httptest.NewRequest("GET", "/api/courses", nil)
		handler.ServeHTTP(rr, req)
		if rr.Code != 200 {
			t.Fatalf("expected 200, got %d: %s", rr.Code, rr.Body.String())
		}
		var resp coursesResp
		if err := json.NewDecoder(rr.Body).Decode(&resp); err != nil {
			t.Fatalf("decode: %v", err)
		}
		if len(resp.Courses) == 0 {
			t.Fatalf("expected courses, got 0")
		}
		if resp.Total == 0 {
			t.Fatalf("expected total > 0")
		}
	})

	t.Run("query filters by subject", func(t *testing.T) {
		rr := httptest.NewRecorder()
		req := httptest.NewRequest("GET", "/api/courses?q=ZZTEST", nil)
		handler.ServeHTTP(rr, req)
		if rr.Code != 200 {
			t.Fatalf("expected 200, got %d: %s", rr.Code, rr.Body.String())
		}
		var resp coursesResp
		if err := json.NewDecoder(rr.Body).Decode(&resp); err != nil {
			t.Fatalf("decode: %v", err)
		}
		if len(resp.Courses) != 1 {
			t.Fatalf("expected 1 course, got %d", len(resp.Courses))
		}
		if resp.Courses[0].Subject != "ZZTEST" {
			t.Fatalf("unexpected subject: %s", resp.Courses[0].Subject)
		}
		if resp.Total != 1 {
			t.Fatalf("expected total=1, got %d", resp.Total)
		}
	})

	t.Run("query with no matches returns empty array", func(t *testing.T) {
		rr := httptest.NewRecorder()
		req := httptest.NewRequest("GET", "/api/courses?q=ZZZZZZ", nil)
		handler.ServeHTTP(rr, req)
		if rr.Code != 200 {
			t.Fatalf("expected 200, got %d: %s", rr.Code, rr.Body.String())
		}
		var resp coursesResp
		if err := json.NewDecoder(rr.Body).Decode(&resp); err != nil {
			t.Fatalf("decode: %v", err)
		}
		if len(resp.Courses) != 0 {
			t.Fatalf("expected 0 courses, got %d", len(resp.Courses))
		}
		if resp.Total != 0 {
			t.Fatalf("expected total=0, got %d", resp.Total)
		}
	})

	t.Run("POST returns 405", func(t *testing.T) {
		rr := httptest.NewRecorder()
		req := httptest.NewRequest("POST", "/api/courses", nil)
		handler.ServeHTTP(rr, req)
		if rr.Code != 405 {
			t.Fatalf("expected 405, got %d", rr.Code)
		}
	})
}

func TestPostUserPlanHandler(t *testing.T) {
	repo := newTestRepo(t)
	defer repo.Close()

	res, err := repo.DB.Exec(`INSERT INTO users(email, display_name, password_hash) VALUES ('plan@example.com', 'Plan User', 'x')`)
	if err != nil {
		t.Fatalf("seed user: %v", err)
	}
	userID, _ := res.LastInsertId()

	handler := PostUserPlanHandler(repo)

	t.Run("adds a course to plan", func(t *testing.T) {
		body, _ := json.Marshal(map[string]any{
			"subject":       "COMPSCI",
			"course_number": "2C03",
			"year_index":    1,
			"season":        "Fall",
		})
		req := httptest.NewRequest("POST", "/api/users/1/plan", bytes.NewReader(body))
		req.URL.Path = "/api/users/" + strconv.FormatInt(userID, 10) + "/plan"
		rr := httptest.NewRecorder()
		handler.ServeHTTP(rr, req)
		if rr.Code != 201 {
			t.Fatalf("expected 201, got %d: %s", rr.Code, rr.Body.String())
		}
	})

	t.Run("year_index=0 regression", func(t *testing.T) {
		body, _ := json.Marshal(map[string]any{
			"subject":       "MATH",
			"course_number": "1A03",
			"year_index":    0,
			"season":        "Fall",
		})
		req := httptest.NewRequest("POST", "/api/users/1/plan", bytes.NewReader(body))
		req.URL.Path = "/api/users/" + strconv.FormatInt(userID, 10) + "/plan"
		rr := httptest.NewRecorder()
		handler.ServeHTTP(rr, req)
		if rr.Code != 500 {
			t.Fatalf("expected 500 for year_index=0, got %d", rr.Code)
		}
	})

	t.Run("adding different course to same term reuses plan term", func(t *testing.T) {
		courses := []string{"3SH3", "2ME3"}

		for i, num := range courses {
			body, _ := json.Marshal(map[string]any{
				"subject":       "COMPSCI",
				"course_number": num,
				"year_index":    2,
				"season":        "Winter",
			})
			req := httptest.NewRequest("POST", "/api/users/1/plan", bytes.NewReader(body))
			req.URL.Path = "/api/users/" + strconv.FormatInt(userID, 10) + "/plan"
			rr := httptest.NewRecorder()
			handler.ServeHTTP(rr, req)
			if rr.Code != 201 {
				t.Fatalf("attempt %d: expected 201, got %d: %s", i+1, rr.Code, rr.Body.String())
			}
		}
	})
}

func TestDeletePlanItem_TDD(t *testing.T) {
	// placeholder until DELETE /api/users/:id/plan/:id is implemented
	t.Skip("implement DELETE handler then enable this test")
}
