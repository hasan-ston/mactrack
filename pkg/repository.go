package pkg

import (
	"database/sql"
	"fmt"
	"sort"
	"strings"

	_ "github.com/mattn/go-sqlite3"
)

// RequisiteRow holds a single row from the requisites table.
// kind will be one of: PREREQ, COREQ, ANTIREQ
type RequisiteRow struct {
	ReqSubject      string `json:"req_subject"`
	ReqCourseNumber string `json:"req_course_number"`
	Kind            string `json:"kind"`
}

var mcmasterGPAScale = map[string]float64{
	"A+": 12.0, "A": 11.0, "A-": 10.0,
	"B+": 9.0, "B": 8.0, "B-": 7.0,
	"C+": 6.0, "C": 5.0, "C-": 4.0,
	"D+": 3.0, "D": 2.0, "D-": 1.0,
	"F": 0.0,
}

func (r *Repository) GetUserGPA(userID int) (gpa float64, ok bool, err error) {
	rows, err := r.DB.Query(`
        SELECT pi.course_number, pi.grade
        FROM plan_items pi
        JOIN plan_terms pt ON pt.plan_term_id = pi.plan_term_id
        WHERE pt.user_id = ?
          AND pi.status = 'COMPLETED'
          AND pi.grade IS NOT NULL
          AND pi.grade != ''`,
		userID)
	if err != nil {
		return 0, false, err
	}
	defer rows.Close()

	totalPoints := 0.0
	totalUnits := 0

	for rows.Next() {
		var courseNumber, grade string
		if err := rows.Scan(&courseNumber, &grade); err != nil {
			return 0, false, err
		}
		points, exists := mcmasterGPAScale[strings.ToUpper(strings.TrimSpace(grade))]
		if !exists {
			continue // skip unrecognised grade strings
		}
		// Weight by real unit value from course number suffix
		units := UnitsFromCourseNumber(courseNumber, 3)
		totalPoints += points * float64(units)
		totalUnits += units
	}

	if totalUnits == 0 {
		return 0, false, nil // no graded courses yet
	}
	return totalPoints / float64(totalUnits), true, nil
}

// GetProgramWithGroups loads a Program with its full requirement group tree
// and courses populated. Used by the validation service.
func (r *Repository) GetProgramWithGroups(programID int) (*Program, error) {
	// Load the program row
	var p Program
	var totalUnits sql.NullInt64
	var degreeType sql.NullString
	err := r.DB.QueryRow(`
        SELECT program_id, poid, name, degree_type, total_units, catalog_year
        FROM programs WHERE program_id = ?`, programID,
	).Scan(&p.ProgramID, &p.POID, &p.Name, &degreeType, &totalUnits, &p.CatalogYear)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("load program: %w", err)
	}
	p.DegreeType = degreeType.String
	if totalUnits.Valid {
		u := int(totalUnits.Int64)
		p.TotalUnits = &u
	}

	// Load all groups for this program
	groupRows, err := r.DB.Query(`
        SELECT group_id, program_id, parent_group_id, display_order, heading,
               heading_level, units_required, courses_required, is_elective, is_container
        FROM requirement_groups
        WHERE program_id = ?
        ORDER BY display_order`, programID)
	if err != nil {
		return nil, fmt.Errorf("load groups: %w", err)
	}
	defer groupRows.Close()

	groupMap := map[int]*RequirementGroup{}
	childrenOf := map[int][]int{}
	var rootIDs []int

	for groupRows.Next() {
		var g RequirementGroup
		var parentID sql.NullInt64
		var unitsReq, coursesReq sql.NullInt64
		var isElective, isContainer int
		if err := groupRows.Scan(
			&g.GroupID, &g.ProgramID, &parentID, &g.DisplayOrder, &g.Heading,
			&g.HeadingLevel, &unitsReq, &coursesReq, &isElective, &isContainer,
		); err != nil {
			return nil, fmt.Errorf("scan group: %w", err)
		}
		if parentID.Valid {
			pid := int(parentID.Int64)
			g.ParentGroupID = &pid
			childrenOf[pid] = append(childrenOf[pid], g.GroupID)
		} else {
			rootIDs = append(rootIDs, g.GroupID)
		}
		if unitsReq.Valid {
			u := int(unitsReq.Int64)
			g.UnitsRequired = &u
		}
		if coursesReq.Valid {
			c := int(coursesReq.Int64)
			g.CoursesRequired = &c
		}
		g.IsElective = isElective == 1
		g.IsContainer = isContainer == 1
		g.Courses = []RequirementCourse{}
		g.Children = []RequirementGroup{}
		groupMap[g.GroupID] = &g
	}

	// Load all courses for this program and attach to groups
	courseRows, err := r.DB.Query(`
        SELECT rc.req_course_id, rc.group_id, rc.display_order,
               rc.coid, rc.course_code, rc.course_name, rc.is_or_with_next, rc.adhoc_text
        FROM requirement_courses rc
        JOIN requirement_groups rg ON rg.group_id = rc.group_id
        WHERE rg.program_id = ?
        ORDER BY rc.group_id, rc.display_order`, programID)
	if err != nil {
		return nil, fmt.Errorf("load courses: %w", err)
	}
	defer courseRows.Close()

	for courseRows.Next() {
		var rc RequirementCourse
		var coid sql.NullInt64
		var courseCode, courseName, adhocText sql.NullString
		var isOrWithNext int
		if err := courseRows.Scan(
			&rc.ReqCourseID, &rc.GroupID, &rc.DisplayOrder,
			&coid, &courseCode, &courseName, &isOrWithNext, &adhocText,
		); err != nil {
			return nil, fmt.Errorf("scan course: %w", err)
		}
		if coid.Valid {
			c := int(coid.Int64)
			rc.Coid = &c
		}
		rc.CourseCode = courseCode.String
		rc.CourseName = courseName.String
		rc.IsOrWithNext = isOrWithNext == 1
		if adhocText.Valid {
			rc.AdhocText = &adhocText.String
		}
		if g, ok := groupMap[rc.GroupID]; ok {
			g.Courses = append(g.Courses, rc)
		}
	}

	// Wire children into parents, then collect root groups
	for parentID, childIDs := range childrenOf {
		parent := groupMap[parentID]
		for _, cid := range childIDs {
			parent.Children = append(parent.Children, *groupMap[cid])
		}
	}
	for _, id := range rootIDs {
		p.Groups = append(p.Groups, *groupMap[id])
	}

	return &p, nil
}

// GetRequisites returns all requisite rows for a given course (subject + course_number).
// Returns an empty slice (not nil) if there are no requisites, so the JSON encodes as [].
func (r *Repository) GetRequisites(subject, courseNumber string) ([]RequisiteRow, error) {
	rows, err := r.DB.Query(`
		SELECT req_subject, req_course_number, kind
		FROM requisites
		WHERE subject = ? AND course_number = ?
		ORDER BY kind, req_subject, req_course_number
	`, subject, courseNumber)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	// Collect into slice so we return [] not null in JSON if empty
	reqs := []RequisiteRow{}
	for rows.Next() {
		var row RequisiteRow
		if err := rows.Scan(&row.ReqSubject, &row.ReqCourseNumber, &row.Kind); err != nil {
			return nil, err
		}
		reqs = append(reqs, row)
	}
	return reqs, rows.Err()
}

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
// It supports multi-token AND search: the query is split on whitespace and every
// token must independently match at least one column (subject, course_number,
// course_name, or professor). This lets searches like "compsci 2" or "software eng"
// work correctly even though those strings never appear verbatim in a single column.
//
// limit ≤ 0 means no cap (returns all matches). offset is 0-based.
// Returns the matching page of courses plus the total number of matches.
func (r *Repository) SearchCourses(q string, limit, offset int) ([]Course, int, error) {
	tokens := strings.Fields(strings.TrimSpace(q))

	// Build WHERE clause — one condition per token, all ANDed together.
	// Each condition checks all four searchable columns with OR.
	var whereParts []string
	var args []interface{}
	for _, tok := range tokens {
		pat := "%" + tok + "%"
		whereParts = append(whereParts,
			"(subject LIKE ? OR course_number LIKE ? OR course_name LIKE ? OR professor LIKE ?)")
		args = append(args, pat, pat, pat, pat)
	}

	where := ""
	if len(whereParts) > 0 {
		where = "WHERE " + strings.Join(whereParts, " AND ")
	}

	// Count total matches first (needed for pagination metadata).
	countQuery := fmt.Sprintf(
		"SELECT COUNT(*) FROM courses %s", where)
	var total int
	if err := r.DB.QueryRow(countQuery, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count courses: %w", err)
	}

	// Fetch the requested page.
	var pageQuery string
	var pageArgs []interface{}
	pageArgs = append(pageArgs, args...)
	if limit > 0 {
		pageQuery = fmt.Sprintf(
			"SELECT id, subject, course_number, course_name, professor, term FROM courses %s ORDER BY subject, course_number LIMIT ? OFFSET ?",
			where)
		pageArgs = append(pageArgs, limit, offset)
	} else {
		pageQuery = fmt.Sprintf(
			"SELECT id, subject, course_number, course_name, professor, term FROM courses %s ORDER BY subject, course_number",
			where)
	}

	rows, err := r.DB.Query(pageQuery, pageArgs...)
	if err != nil {
		return nil, 0, fmt.Errorf("search courses: %w", err)
	}
	defer rows.Close()

	out := []Course{}
	for rows.Next() {
		var c Course
		var courseName, professor sql.NullString
		if err := rows.Scan(&c.ID, &c.Subject, &c.CourseNumber, &courseName, &professor, &c.Term); err != nil {
			return nil, 0, err
		}
		c.CourseName = courseName.String
		c.Professor = professor.String
		out = append(out, c)
	}
	return out, total, rows.Err()
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

// User is the model returned from user-related queries.
// Note: PasswordHash is intentionally excluded from API responses — only used internally.
type User struct {
	UserID       int     `json:"user_id"`
	Email        string  `json:"email"`
	DisplayName  string  `json:"display_name"`
	PasswordHash string  `json:"-"` // The `-` tag means this field is never serialized to JSON
	Program      *string `json:"program,omitempty"`
	YearOfStudy  *int    `json:"year_of_study,omitempty"`
}

// GetUserByEmail looks up a user by their email address.
// Returns (nil, nil) if no user found — not an error, just not found.
func (r *Repository) GetUserByEmail(email string) (*User, error) {
	row := r.DB.QueryRow(
		`SELECT user_id, email, display_name, password_hash, program, year_of_study
		 FROM users WHERE email = ?`, email,
	)
	var u User
	var program sql.NullString
	var year sql.NullInt64
	if err := row.Scan(&u.UserID, &u.Email, &u.DisplayName, &u.PasswordHash, &program, &year); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	if program.Valid {
		u.Program = &program.String
	}
	if year.Valid {
		v := int(year.Int64)
		u.YearOfStudy = &v
	}
	return &u, nil
}

// CreateUser inserts a new user row and returns the created user.
// passwordHash should already be a bcrypt hash — never pass a plaintext password here.
func (r *Repository) CreateUser(email, displayName, passwordHash string, program *string, yearOfStudy *int) (*User, error) {
	// Build args for insert — allow NULL for optional columns
	var y interface{}
	if yearOfStudy != nil {
		y = *yearOfStudy
	} else {
		y = nil
	}
	result, err := r.DB.Exec(
		`INSERT INTO users (email, display_name, password_hash, program, year_of_study) VALUES (?, ?, ?, ?, ?)`,
		email, displayName, passwordHash, program, y,
	)
	if err != nil {
		return nil, err
	}
	id, err := result.LastInsertId()
	if err != nil {
		return nil, err
	}
	u := &User{
		UserID:      int(id),
		Email:       email,
		DisplayName: displayName,
	}
	if program != nil {
		u.Program = program
	}
	if yearOfStudy != nil {
		u.YearOfStudy = yearOfStudy
	}
	return u, nil
}

// GetUserByID fetches a user by their numeric ID.
// Used after token validation to attach full user info to a request.
func (r *Repository) GetUserByID(id int) (*User, error) {
	row := r.DB.QueryRow(
		`SELECT user_id, email, display_name, program, year_of_study FROM users WHERE user_id = ?`, id,
	)
	var u User
	var program sql.NullString
	var year sql.NullInt64
	if err := row.Scan(&u.UserID, &u.Email, &u.DisplayName, &program, &year); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	if program.Valid {
		u.Program = &program.String
	}
	if year.Valid {
		v := int(year.Int64)
		u.YearOfStudy = &v
	}
	return &u, nil
}
