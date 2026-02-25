package pkg

import (
	"database/sql"
	"encoding/json"
	"log"
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

		log.Printf("received: userID=%d yearIndex=%d season=%s subject=%s courseNumber=%s",
			userID, body.YearIndex, body.Season, body.Subject, body.CourseNumber)

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
				log.Printf("failed to create plan term: %v", err)
				http.Error(w, "failed to create plan term", http.StatusInternalServerError)
				return
			}
			id, _ := res.LastInsertId()
			planTermID = int(id)
		}

		// Insert the plan item under the resolved term
		_, err = repo.DB.Exec(`
			INSERT INTO plan_items (plan_term_id, subject, course_number, status)
			VALUES (?, ?, ?, 'PLANNED')`,
			planTermID, body.Subject, body.CourseNumber,
		)
		if err != nil {
			log.Printf("failed to insert plan item: %v", err)
			http.Error(w, "failed to insert plan item", http.StatusInternalServerError)
			return
		}

		w.WriteHeader(http.StatusCreated)
	}
}

// DeleteUserPlanItemHandler serves DELETE /api/users/{id}/plan/{itemId}
// It verifies that the plan item belongs to the requested user and deletes it.
func DeleteUserPlanItemHandler(repo *Repository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodDelete {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		// Expect path: /api/users/{id}/plan/{itemId}
		path := strings.TrimPrefix(r.URL.Path, "/api/users/")
		parts := strings.Split(strings.Trim(path, "/"), "/")
		// parts should be: ["{id}", "plan", "{itemId}"]
		if len(parts) != 3 || parts[1] != "plan" {
			http.Error(w, "invalid path", http.StatusBadRequest)
			return
		}

		userID, err := strconv.Atoi(parts[0])
		if err != nil || userID == 0 {
			http.Error(w, "invalid user id", http.StatusBadRequest)
			return
		}
		itemID, err := strconv.Atoi(parts[2])
		if err != nil || itemID == 0 {
			http.Error(w, "invalid item id", http.StatusBadRequest)
			return
		}

		// Ensure the plan_item belongs to this user by joining plan_items -> plan_terms
		var ownerID int
		err = repo.DB.QueryRow(`
			SELECT pt.user_id FROM plan_items pi
			JOIN plan_terms pt ON pi.plan_term_id = pt.plan_term_id
			WHERE pi.plan_item_id = ?
		`, itemID).Scan(&ownerID)
		if err != nil {
			if err == sql.ErrNoRows {
				http.Error(w, "not found", http.StatusNotFound)
				return
			}
			http.Error(w, "failed to verify ownership", http.StatusInternalServerError)
			return
		}

		if ownerID != userID {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}

		// Delete the plan item
		if _, err := repo.DB.Exec(`DELETE FROM plan_items WHERE plan_item_id = ?`, itemID); err != nil {
			http.Error(w, "failed to delete plan item", http.StatusInternalServerError)
			return
		}

		w.WriteHeader(http.StatusNoContent)
	}
}
