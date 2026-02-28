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
// doesn't need to know the term ID.
func PostUserPlanHandler(repo *Repository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		// Parse user ID from path: /api/users/{id}/plan
		idStr := strings.TrimPrefix(r.URL.Path, "/api/users/")
		idStr = strings.TrimSuffix(idStr, "/plan")
		userID, err := strconv.Atoi(strings.Trim(idStr, "/"))
		if err != nil || userID == 0 {
			http.Error(w, "invalid user id", http.StatusBadRequest)
			return
		}

		// Decode request body — frontend sends subject, course_number, year_index, season
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

		// Resolve existing plan_terms row or create a new one
		var planTermID int
		err = repo.DB.QueryRow(`
			SELECT plan_term_id FROM plan_terms
			WHERE user_id = ? AND year_index = ? AND season = ?`,
			userID, body.YearIndex, body.Season,
		).Scan(&planTermID)

		if err != nil {
			// No existing term — insert a new one
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

		// Insert the course into the resolved/created term
		// status must be uppercase to satisfy the CHECK constraint
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

// PatchUserPlanItemHandler serves PATCH /api/users/{id}/plan/{itemId}
// Updates the status and optionally the grade of a plan item.
// Verifies ownership before updating.
func PatchUserPlanItemHandler(repo *Repository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPatch {
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

		// Decode request body — frontend sends status and optional grade
		var body struct {
			Status string  `json:"status"`
			Grade  *string `json:"grade"` // pointer so we can distinguish "" from absent
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}

		// Validate status is one of the allowed CHECK constraint values
		allowed := map[string]bool{
			"PLANNED": true, "IN_PROGRESS": true, "COMPLETED": true, "DROPPED": true,
		}
		if !allowed[body.Status] {
			http.Error(w, "invalid status", http.StatusBadRequest)
			return
		}

		// Verify the plan item belongs to this user
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

		// Update status and grade — grade may be NULL if not provided
		_, err = repo.DB.Exec(`
			UPDATE plan_items SET status = ?, grade = ? WHERE plan_item_id = ?
		`, body.Status, body.Grade, itemID)
		if err != nil {
			log.Printf("failed to update plan item: %v", err)
			http.Error(w, "failed to update plan item", http.StatusInternalServerError)
			return
		}

		w.WriteHeader(http.StatusNoContent)
	}
}

// DeleteUserPlanItemHandler serves DELETE /api/users/{id}/plan/{itemId}
// Verifies the plan item belongs to the requested user before deleting.
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

// GetUserValidationHandler serves GET /api/users/{id}/validation?program_id={id}
// Loads the user's plan items and validates them against a program's requirements.
func GetUserValidationHandler(repo *Repository, svc *Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		// Parse user ID from path: /api/users/{id}/validation
		idStr := strings.TrimPrefix(r.URL.Path, "/api/users/")
		idStr = strings.TrimSuffix(idStr, "/validation")
		userID, err := strconv.Atoi(strings.Trim(idStr, "/"))
		if err != nil || userID == 0 {
			http.Error(w, "invalid user id", http.StatusBadRequest)
			return
		}

		// program_id is required
		programID, err := strconv.Atoi(r.URL.Query().Get("program_id"))
		if err != nil || programID == 0 {
			http.Error(w, "program_id query param is required", http.StatusBadRequest)
			return
		}

		// Load the program with its full requirement tree
		program, err := repo.GetProgramWithGroups(programID)
		if err != nil {
			log.Printf("load program: %v", err)
			http.Error(w, "failed to load program", http.StatusInternalServerError)
			return
		}
		if program == nil {
			http.Error(w, "program not found", http.StatusNotFound)
			return
		}

		// Load the user's plan items
		rows, err := repo.DB.Query(`
            SELECT pi.plan_item_id, pi.plan_term_id, pi.subject,
                   pi.course_number, pi.status, pi.grade, pi.note
            FROM plan_items pi
            JOIN plan_terms pt ON pt.plan_term_id = pi.plan_term_id
            WHERE pt.user_id = ?`, userID)
		if err != nil {
			http.Error(w, "failed to load plan items", http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		var planItems []PlanItem
		for rows.Next() {
			var pi PlanItem
			var grade, note sql.NullString
			if err := rows.Scan(&pi.PlanItemID, &pi.PlanTermID, &pi.Subject,
				&pi.CourseNumber, &pi.Status, &grade, &note); err != nil {
				http.Error(w, "failed to scan plan item", http.StatusInternalServerError)
				return
			}
			if grade.Valid {
				pi.Grade = &grade.String
			}
			if note.Valid {
				pi.Note = &note.String
			}
			planItems = append(planItems, pi)
		}

		// Run validation against the existing service
		result, err := svc.ValidatePlan(planItems, program)
		if err != nil {
			log.Printf("validation error: %v", err)
			http.Error(w, "validation failed", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(result)
	}
}

// CourseBySubjectNumberHandler serves GET /api/courses/{subject}/{number}
// Used by DegreePlanner and CourseDetail when navigating by subject+number
// instead of numeric ID.
func CourseBySubjectNumberHandler(repo *Repository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Parse subject and course number from path
		parts := strings.Split(strings.TrimPrefix(r.URL.Path, "/api/courses/"), "/")
		subject := strings.ToUpper(parts[0])
		number := parts[1]

		var course struct {
			ID           int    `json:"id"`
			Subject      string `json:"subject"`
			CourseNumber string `json:"course_number"`
			CourseName   string `json:"course_name"`
			Professor    string `json:"professor"`
			Term         string `json:"term"`
		}
		err := repo.DB.QueryRow(`
			SELECT id, subject, course_number, course_name, professor, term
			FROM courses WHERE subject = ? AND course_number = ?
			LIMIT 1`, subject, number).Scan(
			&course.ID, &course.Subject, &course.CourseNumber,
			&course.CourseName, &course.Professor, &course.Term,
		)
		if err != nil {
			http.Error(w, "course not found", http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(course)
	}
}

// CoursesHandler serves GET /api/courses?q={query}
// Returns all courses matching the search query via SearchCourses.
func CoursesHandler(repo *Repository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		q := r.URL.Query().Get("q")
		courses, err := repo.SearchCourses(q)
		if err != nil {
			http.Error(w, "failed to search courses", http.StatusInternalServerError)
			return
		}
		// Return empty array instead of null when no results
		if courses == nil {
			courses = []Course{}
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(courses)
	}
}

// CourseHandler serves GET /api/courses/{id}
// Fetches a single course by its numeric database ID.
func CourseHandler(repo *Repository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		// Parse numeric course ID from path
		idStr := strings.TrimPrefix(r.URL.Path, "/api/courses/")
		id, err := strconv.Atoi(idStr)
		if err != nil || id == 0 {
			http.Error(w, "invalid course id", http.StatusBadRequest)
			return
		}

		course, err := repo.GetCourseByID(id)
		if err != nil {
			http.Error(w, "failed to fetch course", http.StatusInternalServerError)
			return
		}
		if course == nil {
			http.Error(w, "course not found", http.StatusNotFound)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(course)
	}
}

// ProgramsHandler serves GET /api/programs
// Returns all programs ordered by degree type and name.
func ProgramsHandler(repo *Repository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		rows, err := repo.DB.Query(`
			SELECT program_id, poid, name, degree_type, total_units, catalog_year
			FROM programs
			ORDER BY degree_type, name`)
		if err != nil {
			http.Error(w, "failed to fetch programs", http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		// Use sql.Null* types for nullable columns; expose clean JSON fields
		type Program struct {
			ProgramID   int            `json:"program_id"`
			Poid        int            `json:"poid"`
			Name        string         `json:"name"`
			DegreeType  sql.NullString `json:"-"`
			DegreeTypeS string         `json:"degree_type"`
			TotalUnits  sql.NullInt64  `json:"-"`
			TotalUnitsI *int64         `json:"total_units"`
			CatalogYear string         `json:"catalog_year"`
		}

		var programs []Program
		for rows.Next() {
			var p Program
			if err := rows.Scan(&p.ProgramID, &p.Poid, &p.Name, &p.DegreeType, &p.TotalUnits, &p.CatalogYear); err != nil {
				http.Error(w, "failed to scan program", http.StatusInternalServerError)
				return
			}
			p.DegreeTypeS = p.DegreeType.String
			if p.TotalUnits.Valid {
				p.TotalUnitsI = &p.TotalUnits.Int64
			}
			programs = append(programs, p)
		}
		// Return empty array instead of null
		if programs == nil {
			programs = []Program{}
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(programs)
	}
}

// ProgramRequirementsHandler serves GET /api/programs/{id}/requirements
// Returns requirement groups and their courses for a given program.
func ProgramRequirementsHandler(repo *Repository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		// Parse program ID from path: /api/programs/{id}/requirements
		idStr := strings.TrimPrefix(r.URL.Path, "/api/programs/")
		idStr = strings.TrimSuffix(idStr, "/requirements")
		programID, err := strconv.Atoi(strings.Trim(idStr, "/"))
		if err != nil || programID == 0 {
			http.Error(w, "invalid program id", http.StatusBadRequest)
			return
		}

		groupRows, err := repo.DB.Query(`
			SELECT group_id, parent_group_id, display_order, heading,
			       heading_level, units_required, courses_required,
			       is_elective, is_container
			FROM requirement_groups
			WHERE program_id = ?
			ORDER BY display_order`, programID)
		if err != nil {
			http.Error(w, "failed to fetch requirement groups", http.StatusInternalServerError)
			return
		}
		defer groupRows.Close()

		type RequirementCourse struct {
			ReqCourseID  int     `json:"req_course_id"`
			DisplayOrder int     `json:"display_order"`
			Coid         *int    `json:"coid"`
			CourseCode   *string `json:"course_code"`
			CourseName   *string `json:"course_name"`
			IsOrWithNext bool    `json:"is_or_with_next"`
			AdhocText    *string `json:"adhoc_text"`
		}

		type RequirementGroup struct {
			GroupID         int                 `json:"group_id"`
			ParentGroupID   *int                `json:"parent_group_id"`
			DisplayOrder    int                 `json:"display_order"`
			Heading         string              `json:"heading"`
			HeadingLevel    int                 `json:"heading_level"`
			UnitsRequired   *int                `json:"units_required"`
			CoursesRequired *int                `json:"courses_required"`
			IsElective      bool                `json:"is_elective"`
			IsContainer     bool                `json:"is_container"`
			Courses         []RequirementCourse `json:"courses"`
		}

		// Build a map so we can attach courses to their parent group in O(1)
		groupMap := map[int]*RequirementGroup{}
		var groupOrder []int

		for groupRows.Next() {
			var g RequirementGroup
			var parentID sql.NullInt64
			var unitsReq, coursesReq sql.NullInt64

			if err := groupRows.Scan(
				&g.GroupID, &parentID, &g.DisplayOrder, &g.Heading,
				&g.HeadingLevel, &unitsReq, &coursesReq,
				&g.IsElective, &g.IsContainer,
			); err != nil {
				http.Error(w, "failed to scan group", http.StatusInternalServerError)
				return
			}

			if parentID.Valid {
				pid := int(parentID.Int64)
				g.ParentGroupID = &pid
			}
			if unitsReq.Valid {
				u := int(unitsReq.Int64)
				g.UnitsRequired = &u
			}
			if coursesReq.Valid {
				c := int(coursesReq.Int64)
				g.CoursesRequired = &c
			}

			g.Courses = []RequirementCourse{}
			groupMap[g.GroupID] = &g
			groupOrder = append(groupOrder, g.GroupID)
		}

		// Fetch all requirement courses for this program in one query
		courseRows, err := repo.DB.Query(`
			SELECT rc.req_course_id, rc.group_id, rc.display_order,
			       rc.coid, rc.course_code, rc.course_name,
			       rc.is_or_with_next, rc.adhoc_text
			FROM requirement_courses rc
			JOIN requirement_groups rg ON rg.group_id = rc.group_id
			WHERE rg.program_id = ?
			ORDER BY rc.group_id, rc.display_order`, programID)
		if err != nil {
			http.Error(w, "failed to fetch requirement courses", http.StatusInternalServerError)
			return
		}
		defer courseRows.Close()

		for courseRows.Next() {
			var rc RequirementCourse
			var groupID int
			var coid sql.NullInt64
			var courseCode, courseName, adhocText sql.NullString

			if err := courseRows.Scan(
				&rc.ReqCourseID, &groupID, &rc.DisplayOrder,
				&coid, &courseCode, &courseName,
				&rc.IsOrWithNext, &adhocText,
			); err != nil {
				http.Error(w, "failed to scan requirement course", http.StatusInternalServerError)
				return
			}

			if coid.Valid {
				c := int(coid.Int64)
				rc.Coid = &c
			}
			if courseCode.Valid {
				rc.CourseCode = &courseCode.String
			}
			if courseName.Valid {
				rc.CourseName = &courseName.String
			}
			if adhocText.Valid {
				rc.AdhocText = &adhocText.String
			}

			// Attach course to its parent group
			if g, ok := groupMap[groupID]; ok {
				g.Courses = append(g.Courses, rc)
			}
		}

		// Preserve original display_order by iterating groupOrder
		result := make([]*RequirementGroup, 0, len(groupOrder))
		for _, id := range groupOrder {
			result = append(result, groupMap[id])
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(result)
	}
}

// GetUserPlanHandler serves GET /api/users/{id}/plan
// Returns all plan items for a user, joined with term and course name.
func GetUserPlanHandler(repo *Repository, svc *Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		// Parse user ID from path: /api/users/{id}/plan
		idStr := strings.TrimPrefix(r.URL.Path, "/api/users/")
		idStr = strings.TrimSuffix(idStr, "/plan")
		userID, err := strconv.Atoi(strings.Trim(idStr, "/"))
		if err != nil || userID == 0 {
			http.Error(w, "invalid user id", http.StatusBadRequest)
			return
		}

		// Join plan_items → plan_terms → courses to get course name in one query
		rows, err := repo.DB.Query(`
			SELECT pi.plan_item_id, pi.plan_term_id,
			       pi.subject, pi.course_number,
			       pi.status, pi.grade, pi.note,
			       pt.year_index, pt.season,
			       MAX(c.course_name) as course_name
			FROM plan_items pi
			JOIN plan_terms pt ON pt.plan_term_id = pi.plan_term_id
			LEFT JOIN courses c ON c.subject = pi.subject
			       AND c.course_number = pi.course_number
			WHERE pt.user_id = ?
			GROUP BY pi.plan_item_id
			ORDER BY pt.year_index, pt.season, pi.subject, pi.course_number`,
			userID)
		if err != nil {
			http.Error(w, "failed to fetch plan items", http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		type PlanItem struct {
			PlanItemID   int     `json:"plan_item_id"`
			PlanTermID   int     `json:"plan_term_id"`
			Subject      string  `json:"subject"`
			CourseNumber string  `json:"course_number"`
			Status       string  `json:"status"`
			Grade        *string `json:"grade"`
			Note         *string `json:"note"`
			YearIndex    int     `json:"year_index"`
			Season       string  `json:"season"`
			CourseName   *string `json:"course_name"`
		}

		var items []PlanItem
		for rows.Next() {
			var pi PlanItem
			var grade, note, courseName sql.NullString
			if err := rows.Scan(
				&pi.PlanItemID, &pi.PlanTermID,
				&pi.Subject, &pi.CourseNumber,
				&pi.Status, &grade, &note,
				&pi.YearIndex, &pi.Season,
				&courseName,
			); err != nil {
				http.Error(w, "failed to scan plan item", http.StatusInternalServerError)
				return
			}
			if grade.Valid {
				pi.Grade = &grade.String
			}
			if note.Valid {
				pi.Note = &note.String
			}
			if courseName.Valid {
				pi.CourseName = &courseName.String
			}
			items = append(items, pi)
		}

		// Return empty array instead of null
		if items == nil {
			items = []PlanItem{}
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(items)
	}
}

// CourseRequisitesHandler serves GET /api/courses/{subject}/{number}/requisites
// Returns prereqs, coreqs, and antireqs grouped by kind.
func CourseRequisitesHandler(repo *Repository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		// Strip prefix and suffix to isolate subject/number
		path := strings.TrimPrefix(r.URL.Path, "/api/courses/")
		path = strings.TrimSuffix(path, "/requisites")

		parts := strings.SplitN(path, "/", 2)
		if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
			http.Error(w, "expected /api/courses/<subject>/<number>/requisites", http.StatusBadRequest)
			return
		}

		subject := parts[0]
		courseNumber := parts[1]

		rows, err := repo.DB.Query(`
			SELECT req_subject, req_course_number, kind
			FROM requisites
			WHERE subject = ? AND course_number = ?
			ORDER BY kind, req_subject, req_course_number
		`, subject, courseNumber)
		if err != nil {
			http.Error(w, "failed to fetch requisites", http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		reqs := []RequisiteRow{}
		for rows.Next() {
			var req RequisiteRow
			if err := rows.Scan(&req.ReqSubject, &req.ReqCourseNumber, &req.Kind); err != nil {
				http.Error(w, "failed to scan requisite", http.StatusInternalServerError)
				return
			}
			reqs = append(reqs, req)
		}
		if err := rows.Err(); err != nil {
			http.Error(w, "error reading requisites", http.StatusInternalServerError)
			return
		}

		// Always return all three kinds even if empty, so the frontend
		// doesn't need to null-check each key
		grouped := map[string][]RequisiteRow{
			"PREREQ":  {},
			"COREQ":   {},
			"ANTIREQ": {},
		}
		for _, req := range reqs {
			if _, ok := grouped[req.Kind]; ok {
				grouped[req.Kind] = append(grouped[req.Kind], req)
			}
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(grouped)
	}
}