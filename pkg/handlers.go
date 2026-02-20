package pkg

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
)

// CoursesHandler serves GET /api/courses?q=search
func CoursesHandler(repo *Repository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		q := strings.TrimSpace(r.URL.Query().Get("q"))
		var courses []Course
		var err error
		if q == "" {
			// empty query — return first N rows
			courses, err = repo.SearchCourses("")
		} else {
			courses, err = repo.SearchCourses(q)
		}
		if err != nil {
			http.Error(w, "failed to query courses", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(courses)
	}
}

// CourseHandler serves GET /api/courses/{id}
func CourseHandler(repo *Repository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// path is expected like /api/courses/123
		idStr := strings.TrimPrefix(r.URL.Path, "/api/courses/")
		if idStr == "" {
			http.Error(w, "missing id", http.StatusBadRequest)
			return
		}
		id, err := strconv.Atoi(idStr)
		if err != nil {
			http.Error(w, "invalid id", http.StatusBadRequest)
			return
		}
		c, err := repo.GetCourseByID(id)
		if err != nil {
			http.Error(w, "failed to fetch course", http.StatusInternalServerError)
			return
		}
		if c == nil {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(c)
	}
}
