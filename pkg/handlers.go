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
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		// Extract user ID from path: /api/users/{id}/plan
		idStr := strings.TrimPrefix(r.URL.Path, "/api/users/")
		idStr = strings.TrimSuffix(idStr, "/plan")
		userID, err := strconv.Atoi(strings.Trim(idStr, "/"))
		if err != nil || userID == 0 {
			http.Error(w, "invalid user id", http.StatusBadRequest)
			return
		}

		// Decode request body
		var body struct {
			Subject      string `json:"subject"`
			CourseNumber string `json:"course_number"`
			YearIndex    int    `json:"year_index"`
			Season       string `json:"season"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}

		// Resolve or create the plan_terms row for this user/year/season
		var planTermID int
		err = repo.DB.QueryRow(`
			SELECT plan_term_id FROM plan_terms
			WHERE user_id = ? AND year_index = ? AND season = ?`,
			userID, body.YearIndex, body.Season,
		).Scan(&planTermID)

		if err != nil {
			// Row doesn't exist yet — create it
			res, err := repo.DB.Exec(`
				INSERT INTO plan_terms (user_id, year_index, season)
				VALUES (?, ?, ?)`,
				userID, body.YearIndex, body.Season,
			)
			if err != nil {
				http.Error(w, "failed to create plan term", http.StatusInternalServerError)
				return
			}
			id, _ := res.LastInsertId()
			planTermID = int(id)
		}

		// Insert the plan item under the resolved term
		_, err = repo.DB.Exec(`
			INSERT INTO plan_items (plan_term_id, subject, course_number, status)
			VALUES (?, ?, ?, 'planned')`,
			planTermID, body.Subject, body.CourseNumber,
		)
		if err != nil {
			http.Error(w, "failed to insert plan item", http.StatusInternalServerError)
			return
		}

		w.WriteHeader(http.StatusCreated)
	}
}
