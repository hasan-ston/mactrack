package pkg

import (
	"database/sql"
	"fmt"
	"sort"

	_ "github.com/mattn/go-sqlite3"
)

type Repository struct {
	DB *sql.DB
}

// NewRepository opens the SQLite database at the given path.
func NewRepository(dbPath string) (*Repository, error) {
	db, err := sql.Open("sqlite3", dbPath)
	if err != nil {
		return nil, err
	}
	// Simple ping to validate
	if err := db.Ping(); err != nil {
		db.Close()
		return nil, fmt.Errorf("cannot connect to db: %w", err)
	}
	return &Repository{DB: db}, nil
}

// SearchCourses searches courses by subject, number, name, or professor.
func (r *Repository) SearchCourses(q string) ([]Course, error) {
	var rows *sql.Rows
	var err error

	if q == "" {
		// No search query — return all courses, no limit
		rows, err = r.DB.Query(`
			SELECT id, subject, course_number, course_name, professor, term
			FROM courses
			ORDER BY subject, course_number`)
	} else {
		// Search query — limit to 200 results to keep responses fast
		pattern := "%" + q + "%"
		rows, err = r.DB.Query(`
			SELECT id, subject, course_number, course_name, professor, term
			FROM courses
			WHERE subject LIKE ? OR course_number LIKE ? OR course_name LIKE ? OR professor LIKE ?
			ORDER BY subject, course_number
			LIMIT 200`, pattern, pattern, pattern, pattern)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []Course{}
	for rows.Next() {
		var c Course
		var courseName, professor sql.NullString
		if err := rows.Scan(&c.ID, &c.Subject, &c.CourseNumber, &courseName, &professor, &c.Term); err != nil {
			return nil, err
		}
		c.CourseName = courseName.String
		c.Professor = professor.String
		out = append(out, c)
	}
	return out, rows.Err()
}

// GetCourseByID fetches a single course by id.
func (r *Repository) GetCourseByID(id int) (*Course, error) {
	row := r.DB.QueryRow(`SELECT id, subject, course_number, course_name, professor, term FROM courses WHERE id = ?`, id)
	var c Course
	var courseName, professor sql.NullString
	if err := row.Scan(&c.ID, &c.Subject, &c.CourseNumber, &courseName, &professor, &c.Term); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	c.CourseName = courseName.String
	c.Professor = professor.String
	return &c, nil
}

// Close closes the underlying DB connection.
func (r *Repository) Close() error {
	if r.DB != nil {
		return r.DB.Close()
	}
	return nil
}

// GetAllPrograms returns a lightweight list of programs for dropdowns.
func (r *Repository) GetAllPrograms() ([]Program, error) {
	rows, err := r.DB.Query(`SELECT program_id, poid, name, degree_type, total_units, catalog_year FROM programs ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []Program{}
	for rows.Next() {
		var p Program
		var totalUnits sql.NullInt64
		if err := rows.Scan(&p.ProgramID, &p.POID, &p.Name, &p.DegreeType, &totalUnits, &p.CatalogYear); err != nil {
			return nil, err
		}
		if totalUnits.Valid {
			val := int(totalUnits.Int64)
			p.TotalUnits = &val
		}
		out = append(out, p)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return out, nil
}

// GetPlanItems fetches plan items for a user (all terms).
func (r *Repository) GetPlanItems(userID int) ([]PlanItem, error) {
	rows, err := r.DB.Query(`
		SELECT pi.plan_item_id, pi.plan_term_id, pi.subject, pi.course_number, pi.status, pi.grade, pi.note
		FROM plan_items pi
		JOIN plan_terms pt ON pi.plan_term_id = pt.plan_term_id
		WHERE pt.user_id = ?
		ORDER BY pt.year_index, pt.season, pi.plan_term_id, pi.plan_item_id
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []PlanItem{}
	for rows.Next() {
		var pi PlanItem
		var grade, note sql.NullString
		if err := rows.Scan(&pi.PlanItemID, &pi.PlanTermID, &pi.Subject, &pi.CourseNumber, &pi.Status, &grade, &note); err != nil {
			return nil, err
		}
		if grade.Valid {
			pi.Grade = &grade.String
		}
		if note.Valid {
			pi.Note = &note.String
		}
		out = append(out, pi)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return out, nil
}

// GetProgramRequirements fetches a program and its full requirement group tree + courses.
func (r *Repository) GetProgramRequirements(programID int) (*Program, error) {
	// Load program basic info
	row := r.DB.QueryRow(`SELECT program_id, poid, name, degree_type, total_units, catalog_year FROM programs WHERE program_id = ?`, programID)
	var p Program
	var totalUnits sql.NullInt64
	if err := row.Scan(&p.ProgramID, &p.POID, &p.Name, &p.DegreeType, &totalUnits, &p.CatalogYear); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	if totalUnits.Valid {
		val := int(totalUnits.Int64)
		p.TotalUnits = &val
	}

	// Load groups
	gRows, err := r.DB.Query(`
		SELECT group_id, program_id, parent_group_id, display_order, heading, heading_level, units_required, courses_required, is_elective, is_container
		FROM requirement_groups
		WHERE program_id = ?
		ORDER BY parent_group_id, display_order
	`, programID)
	if err != nil {
		return nil, err
	}
	defer gRows.Close()

	groupsByID := map[int]*RequirementGroup{}
	rootIDs := []int{}
	for gRows.Next() {
		var g RequirementGroup
		var parent sql.NullInt64
		var unitsReq, coursesReq sql.NullInt64
		var isElective, isContainer int
		if err := gRows.Scan(&g.GroupID, &g.ProgramID, &parent, &g.DisplayOrder, &g.Heading, &g.HeadingLevel, &unitsReq, &coursesReq, &isElective, &isContainer); err != nil {
			return nil, err
		}
		if parent.Valid {
			v := int(parent.Int64)
			g.ParentGroupID = &v
		}
		if unitsReq.Valid {
			v := int(unitsReq.Int64)
			g.UnitsRequired = &v
		}
		if coursesReq.Valid {
			v := int(coursesReq.Int64)
			g.CoursesRequired = &v
		}
		g.IsElective = isElective == 1
		g.IsContainer = isContainer == 1
		groupsByID[g.GroupID] = &g
		if g.ParentGroupID == nil {
			rootIDs = append(rootIDs, g.GroupID)
		}
	}
	if err := gRows.Err(); err != nil {
		return nil, err
	}

	// Load all requirement_courses for this program's groups
	groupIDs := make([]int, 0, len(groupsByID))
	for id := range groupsByID {
		groupIDs = append(groupIDs, id)
	}
	if len(groupIDs) > 0 {
		// Build a query with IN (...) placeholders
		placeholders := ""
		args := []interface{}{}
		for i, id := range groupIDs {
			if i > 0 {
				placeholders += ","
			}
			placeholders += "?"
			args = append(args, id)
		}
		q := fmt.Sprintf(`
			SELECT req_course_id, group_id, display_order, coid, course_code, course_name, is_or_with_next, adhoc_text
			FROM requirement_courses
			WHERE group_id IN (%s)
			ORDER BY group_id, display_order
		`, placeholders)
		rcRows, err := r.DB.Query(q, args...)
		if err != nil {
			return nil, err
		}
		defer rcRows.Close()
		for rcRows.Next() {
			var rc RequirementCourse
			var coid sql.NullInt64
			var adhoc sql.NullString
			var isOr int
			if err := rcRows.Scan(&rc.ReqCourseID, &rc.GroupID, &rc.DisplayOrder, &coid, &rc.CourseCode, &rc.CourseName, &isOr, &adhoc); err != nil {
				return nil, err
			}
			if coid.Valid {
				v := int(coid.Int64)
				rc.Coid = &v
			}
			if adhoc.Valid {
				s := adhoc.String
				rc.AdhocText = &s
			}
			rc.IsOrWithNext = isOr == 1
			if g, ok := groupsByID[rc.GroupID]; ok {
				g.Courses = append(g.Courses, rc)
			}
		}
		if err := rcRows.Err(); err != nil {
			return nil, err
		}
	}

	// Build tree: attach children to parents
	// First collect IDs and ensure stable order
	ids := make([]int, 0, len(groupsByID))
	for id := range groupsByID {
		ids = append(ids, id)
	}
	sort.Ints(ids)
	for _, id := range ids {
		g := groupsByID[id]
		if g.ParentGroupID != nil {
			if parent, ok := groupsByID[*g.ParentGroupID]; ok {
				parent.Children = append(parent.Children, *g)
			}
		}
	}

	// Collect root groups in display order
	roots := []RequirementGroup{}
	for _, rid := range rootIDs {
		if g, ok := groupsByID[rid]; ok {
			roots = append(roots, *g)
		}
	}
	// Sort roots by DisplayOrder
	sort.SliceStable(roots, func(i, j int) bool { return roots[i].DisplayOrder < roots[j].DisplayOrder })
	p.Groups = roots

	return &p, nil
}
