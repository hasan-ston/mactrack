package pkg

import (
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

func TestDeletePlanItem_TDD(t *testing.T) {
	// placeholder until DELETE handler is implemented
	t.Skip("implement DELETE /api/users/:id/plan/:id first")
}
