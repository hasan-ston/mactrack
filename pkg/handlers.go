package pkg

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
)

// PostUserPlanHandler serves POST /api/users/{id}/plan
// Accepts year_index + season instead of plan_term_id — the handler
// resolves or creates the plan_terms row internally so the frontend
// doesn't need to know about it.
func PostUserPlanHandler(repo *Repository) http.HandlerFunc {
	type payload struct {
		YearIndex    int    `json:"year_index"`
		Season       string `json:"season"`
		Subject      string `json:"subject"`
		CourseNumber string `json:"course_number"`
		Status       string `json:"status"`
	}
	return func(w http.ResponseWriter, r *http.Request) {
		// Parse user ID from path /api/users/{id}/plan
		idStr := strings.TrimPrefix(r.URL.Path, "/api/users/")
		idStr = strings.TrimSuffix(idStr, "/plan")
		userID, err := strconv.Atoi(strings.Trim(idStr, "/"))
		if err != nil || userID == 0 {
			http.Error(w, "invalid user id", http.StatusBadRequest)
			return
		}

		var p payload
		if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
			http.Error(w, "invalid body", http.StatusBadRequest)
			return
		}

		// Validate required fields
		if p.YearIndex == 0 || p.Season == "" || p.Subject == "" || p.CourseNumber == "" || p.Status == "" {
			http.Error(w, "missing fields", http.StatusBadRequest)
			return
		}

		// Step 1: find or create the plan_terms row for this user/year/season.
		// INSERT OR IGNORE means it's a no-op if the row already exists.
		_, err = repo.DB.Exec(`
            INSERT OR IGNORE INTO plan_terms (user_id, year_index, season)
            VALUES (?, ?, ?)`,
			userID, p.YearIndex, p.Season,
		)
		if err != nil {
			http.Error(w, "failed to create plan term", http.StatusInternalServerError)
			return
		}

		// Step 2: fetch the plan_term_id (whether just created or pre-existing)
		var planTermID int
		err = repo.DB.QueryRow(`
            SELECT plan_term_id FROM plan_terms
            WHERE user_id = ? AND year_index = ? AND season = ?`,
			userID, p.YearIndex, p.Season,
		).Scan(&planTermID)
		if err != nil {
			http.Error(w, "failed to fetch plan term", http.StatusInternalServerError)
			return
		}

		// Step 3: insert the plan item linked to that term
		_, err = repo.DB.Exec(`
            INSERT OR IGNORE INTO plan_items (plan_term_id, subject, course_number, status, grade, note)
            VALUES (?, ?, ?, ?, NULL, NULL)`,
			planTermID, p.Subject, p.CourseNumber, p.Status,
		)
		if err != nil {
			http.Error(w, "failed to insert plan item", http.StatusInternalServerError)
			return
		}

		w.WriteHeader(http.StatusCreated)
	}
}
