package pkg

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
)

// ---------------------------------------------------------------------------
// CoursesHandler — GET /api/courses?q=
// Returns all courses, or filters by q if provided (max 200 results).
// ---------------------------------------------------------------------------
func CoursesHandler(repo *Repository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		q := r.URL.Query().Get("q")

		// SearchCourses already handles empty q (returns all) and limits to 200
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

// ---------------------------------------------------------------------------
// CourseHandler — GET /api/courses/{id}
// Returns a single course by its integer row ID.
// ---------------------------------------------------------------------------
func CourseHandler(repo *Repository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		// Path is /api/courses/123 — strip the prefix to get the ID
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

// ---------------------------------------------------------------------------
// ProgramsHandler — GET /api/programs
// Returns all degree programs (id, name, degree_type) for the dropdown.
// ---------------------------------------------------------------------------
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
			// Unwrap nullable fields
			p.DegreeTypeS = p.DegreeType.String
			if p.TotalUnits.Valid {
				p.TotalUnitsI = &p.TotalUnits.Int64
			}
			programs = append(programs, p)
		}
		if programs == nil {
			programs = []Program{}
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(programs)
	}
}

// ---------------------------------------------------------------------------
// ProgramRequirementsHandler — GET /api/programs/{id}/requirements
// Returns the full requirement tree (groups + courses) for one program.
// ---------------------------------------------------------------------------
func ProgramRequirementsHandler(repo *Repository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		// Path is /api/programs/123/requirements — strip both ends
		idStr := strings.TrimPrefix(r.URL.Path, "/api/programs/")
		idStr = strings.TrimSuffix(idStr, "/requirements")
		programID, err := strconv.Atoi(strings.Trim(idStr, "/"))
		if err != nil || programID == 0 {
			http.Error(w, "invalid program id", http.StatusBadRequest)
			return
		}

		// Fetch all requirement groups for this program
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

		// Collect groups into a map so we can attach courses to them
		groupMap := map[int]*RequirementGroup{}
		var groupOrder []int // preserves insertion order for the response

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

			g.Courses = []RequirementCourse{} // avoid null in JSON
			groupMap[g.GroupID] = &g
			groupOrder = append(groupOrder, g.GroupID)
		}

		// Fetch all courses for all groups in one query
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

			// Attach this course to its parent group
			if g, ok := groupMap[groupID]; ok {
				g.Courses = append(g.Courses, rc)
			}
		}

		// Build the ordered slice for the response
		result := make([]*RequirementGroup, 0, len(groupOrder))
		for _, id := range groupOrder {
			result = append(result, groupMap[id])
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(result)
	}
}

// ---------------------------------------------------------------------------
// GetUserPlanHandler — GET /api/users/{id}/plan
// Returns all plan items for a user, joined with their term info.
// ---------------------------------------------------------------------------
func GetUserPlanHandler(repo *Repository, svc *Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		idStr := strings.TrimPrefix(r.URL.Path, "/api/users/")
		idStr = strings.TrimSuffix(idStr, "/plan")
		userID, err := strconv.Atoi(strings.Trim(idStr, "/"))
		if err != nil || userID == 0 {
			http.Error(w, "invalid user id", http.StatusBadRequest)
			return
		}

		// Join plan_items with plan_terms and courses to return year_index,
		// season, and course_name so the frontend can display full course info
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
			CourseName   *string `json:"course_name"` // from courses table join
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
