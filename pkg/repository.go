package pkg

import (
	"database/sql"
	"fmt"
	"regexp"
	"sort"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/stdlib"
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
	rows, err := r.query(`
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
	err := r.queryRow(`
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
	groupRows, err := r.query(`
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
	courseRows, err := r.query(`
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

		// If course_code is empty but course_name contains course info, extract it.
		// Format: "View course details for SUBJECT NUMBER ... - Title"
		// e.g. "View course details for ENGINEER 1P13 A/B - Integrated Cornerstone..."
		if rc.CourseCode == "" && strings.HasPrefix(rc.CourseName, "View course details for ") {
			rest := strings.TrimPrefix(rc.CourseName, "View course details for ")
			// Split on " - " to separate code from title
			if dashIdx := strings.Index(rest, " - "); dashIdx > 0 {
				codeWithVariant := strings.TrimSpace(rest[:dashIdx])
				// Code may have variants like "A/B" or "A/B/S" at the end — strip them
				// Pattern: "SUBJECT NUMBER" possibly followed by " X/Y" or " X/Y/Z"
				parts := strings.Fields(codeWithVariant)
				if len(parts) >= 2 {
					// Check if last part is a variant suffix (single chars separated by /)
					lastPart := parts[len(parts)-1]
					isVariant := len(lastPart) <= 5 && strings.Contains(lastPart, "/")
					if isVariant && len(parts) >= 3 {
						// e.g. ["ENGINEER", "1P13", "A/B"] → "ENGINEER 1P13"
						rc.CourseCode = strings.Join(parts[:len(parts)-1], " ")
					} else {
						// e.g. ["ENGINEER", "1P13"] → "ENGINEER 1P13"
						rc.CourseCode = parts[0] + " " + parts[1]
					}
				}
			}
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
	rows, err := r.query(`
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
	DB     *sql.DB
	driver string // "postgres" or "sqlite3"
}

// paramRe matches bare ? parameter placeholders used in SQLite-style queries.
var paramRe = regexp.MustCompile(`\?`)

// adaptQuery rewrites a query for the active driver:
//   - For PostgreSQL: replaces ? placeholders with $1, $2, …, LIKE with ILIKE,
//     and LIMIT -1 with LIMIT ALL.
//   - For SQLite (and tests): returns the query unchanged.
func (r *Repository) adaptQuery(q string) string {
	if r.driver != "postgres" {
		return q
	}
	n := 0
	q = paramRe.ReplaceAllStringFunc(q, func(string) string {
		n++
		return fmt.Sprintf("$%d", n)
	})
	// Case-insensitive LIKE for full-text search
	q = strings.ReplaceAll(q, " LIKE ", " ILIKE ")
	// SQLite allows LIMIT -1 for "all rows"; PostgreSQL needs LIMIT ALL
	q = strings.ReplaceAll(q, "LIMIT -1", "LIMIT ALL")
	return q
}

// query is a thin wrapper around DB.Query that adapts the SQL to the driver.
func (r *Repository) query(q string, args ...interface{}) (*sql.Rows, error) {
	return r.DB.Query(r.adaptQuery(q), args...)
}

// queryRow is a thin wrapper around DB.QueryRow that adapts the SQL to the driver.
func (r *Repository) queryRow(q string, args ...interface{}) *sql.Row {
	return r.DB.QueryRow(r.adaptQuery(q), args...)
}

// exec is a thin wrapper around DB.Exec that adapts the SQL to the driver.
func (r *Repository) exec(q string, args ...interface{}) (sql.Result, error) {
	return r.DB.Exec(r.adaptQuery(q), args...)
}

// Query exposes the adapted query method publicly (used by handlers).
func (r *Repository) Query(q string, args ...interface{}) (*sql.Rows, error) {
	return r.query(q, args...)
}

// QueryRow exposes the adapted queryRow method publicly (used by handlers).
func (r *Repository) QueryRow(q string, args ...interface{}) *sql.Row {
	return r.queryRow(q, args...)
}

// Exec exposes the adapted exec method publicly (used by handlers).
func (r *Repository) Exec(q string, args ...interface{}) (sql.Result, error) {
	return r.exec(q, args...)
}

// execReturningID runs an INSERT and returns the newly created row ID.
// For PostgreSQL it appends RETURNING <pkCol>; for SQLite it uses LastInsertId.
func (r *Repository) execReturningID(q, pkCol string, args ...interface{}) (int64, error) {
	if r.driver == "postgres" {
		var id int64
		err := r.DB.QueryRow(r.adaptQuery(q)+" RETURNING "+pkCol, args...).Scan(&id)
		return id, err
	}
	res, err := r.DB.Exec(r.adaptQuery(q), args...)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

// ExecReturningID exposes execReturningID publicly (used by handlers).
func (r *Repository) ExecReturningID(q, pkCol string, args ...interface{}) (int64, error) {
	return r.execReturningID(q, pkCol, args...)
}

// NewRepository opens a database connection.
func NewRepository(dsn string) (*Repository, error) {
	isPostgres := strings.HasPrefix(dsn, "postgres://") || strings.HasPrefix(dsn, "postgresql://") || strings.Contains(dsn, "host=")

	var db *sql.DB
	driverName := "sqlite3"

	if isPostgres {
		// Use simple query protocol so pgx never creates named prepared statements.
		// This is required when connecting through Supabase's PgBouncer pooler,
		// which runs in transaction mode and does not support prepared statements.
		cfg, err := pgx.ParseConfig(dsn)
		if err != nil {
			return nil, fmt.Errorf("cannot parse postgres dsn: %w", err)
		}
		cfg.DefaultQueryExecMode = pgx.QueryExecModeSimpleProtocol
		db = stdlib.OpenDB(*cfg)
		driverName = "pgx"
	} else {
		var err error
		db, err = sql.Open(driverName, dsn)
		if err != nil {
			return nil, err
		}
	}

	if err := db.Ping(); err != nil {
		db.Close()
		return nil, fmt.Errorf("cannot connect to db (%s): %w", driverName, err)
	}
	// Use canonical name "postgres" for internal dialect checks regardless of driver.
	driver := driverName
	if isPostgres {
		driver = "postgres"
	}
	return &Repository{DB: db, driver: driver}, nil
}

// SearchCourses searches courses by subject, number, name, or professor.
// It supports multi-token AND search: the query is split on whitespace and every
// token must independently match at least one column (subject, course_number,
// course_name, or professor). This lets searches like "compsci 2" or "software eng"
// work correctly even though those strings never appear verbatim in a single column.
//
// level filters by the first digit of course_number (e.g. "2" = 2000-level courses).
// term filters by partial match on the term string (e.g. "Fall", "Winter").
// Either filter is ignored when empty or "all".
// limit ≤ 0 means no cap (returns all matches). offset is 0-based.
// Returns the matching page of courses plus the total number of matches.
func (r *Repository) SearchCourses(q, level, term string, limit, offset int) ([]Course, int, error) {
	tokens := strings.Fields(strings.TrimSpace(q))

	// Build WHERE clause — one condition per token, all ANDed together.
	// Each condition checks all four searchable columns with OR.
	var whereParts []string
	var args []interface{}
	for _, tok := range tokens {
		pat := "%" + tok + "%"
		whereParts = append(whereParts,
			"(c.subject LIKE ? OR c.course_number LIKE ? OR c.course_name LIKE ? OR c.professor LIKE ?)")
		args = append(args, pat, pat, pat, pat)
	}

	// Level filter: course_number must start with the given digit (e.g. "2" → 2000-level).
	if level != "" && level != "all" {
		whereParts = append(whereParts, "c.course_number LIKE ?")
		args = append(args, level+"%")
	}

	// Term filter: term string must contain the given value (e.g. "Fall", "Winter").
	if term != "" && term != "all" {
		whereParts = append(whereParts, "c.term LIKE ?")
		args = append(args, "%"+term+"%")
	}

	where := ""
	if len(whereParts) > 0 {
		where = "WHERE " + strings.Join(whereParts, " AND ")
	}

	// Count total matches first (needed for pagination metadata).
	countQuery := fmt.Sprintf(
		"SELECT COUNT(*) FROM courses c %s", where)
	var total int
	if err := r.queryRow(countQuery, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count courses: %w", err)
	}

	// Fetch the requested page with aggregated instructor stats.
	var pageQuery string
	var pageArgs []interface{}
	pageArgs = append(pageArgs, args...)
	if limit > 0 {
		pageQuery = fmt.Sprintf(
			`SELECT c.id, c.subject, c.course_number, c.course_name, c.professor, c.term,
			        AVG(i.ext_avg_rating), AVG(i.ext_avg_difficulty), SUM(i.ext_num_ratings)
			 FROM courses c
			 LEFT JOIN course_instructors ci ON c.id = ci.course_row_id
			 LEFT JOIN instructors i ON ci.instructor_id = i.instructor_id AND i.ext_avg_rating IS NOT NULL
			 %s
			 GROUP BY c.id
			 ORDER BY c.subject, c.course_number LIMIT ? OFFSET ?`,
			where)
		pageArgs = append(pageArgs, limit, offset)
	} else {
		pageQuery = fmt.Sprintf(
			`SELECT c.id, c.subject, c.course_number, c.course_name, c.professor, c.term,
			        AVG(i.ext_avg_rating), AVG(i.ext_avg_difficulty), SUM(i.ext_num_ratings)
			 FROM courses c
			 LEFT JOIN course_instructors ci ON c.id = ci.course_row_id
			 LEFT JOIN instructors i ON ci.instructor_id = i.instructor_id AND i.ext_avg_rating IS NOT NULL
			 %s
			 GROUP BY c.id
			 ORDER BY c.subject, c.course_number LIMIT -1 OFFSET ?`,
			where)
		pageArgs = append(pageArgs, offset)
	}

	rows, err := r.query(pageQuery, pageArgs...)
	if err != nil {
		return nil, 0, fmt.Errorf("search courses: %w", err)
	}
	defer rows.Close()

	out := []Course{}
	for rows.Next() {
		var c Course
		var courseName, professor sql.NullString
		var avgRating, avgDifficulty sql.NullFloat64
		var numRatings sql.NullInt64
		if err := rows.Scan(&c.ID, &c.Subject, &c.CourseNumber, &courseName, &professor, &c.Term,
			&avgRating, &avgDifficulty, &numRatings); err != nil {
			return nil, 0, err
		}
		c.CourseName = courseName.String
		c.Professor = professor.String
		if avgRating.Valid {
			v := avgRating.Float64
			c.AvgRating = &v
		}
		if avgDifficulty.Valid {
			v := avgDifficulty.Float64
			c.AvgDifficulty = &v
		}
		if numRatings.Valid {
			v := int(numRatings.Int64)
			c.NumRatings = &v
		}
		out = append(out, c)
	}
	return out, total, rows.Err()
}

// GetCourseByID fetches a single course by id.
func (r *Repository) GetCourseByID(id int) (*Course, error) {
	row := r.queryRow(`SELECT id, subject, course_number, course_name, professor, term FROM courses WHERE id = ?`, id)
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
	rows, err := r.query(`SELECT program_id, poid, name, degree_type, total_units, catalog_year FROM programs ORDER BY name`)
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
	rows, err := r.query(`
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
	row := r.queryRow(`SELECT program_id, poid, name, degree_type, total_units, catalog_year FROM programs WHERE program_id = ?`, programID)
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
	gRows, err := r.query(`
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
		// Build a query with positional placeholders for the IN (...) list.
		// We always use ? here and let adaptQuery renumber them for PostgreSQL.
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
		rcRows, err := r.query(q, args...)
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
	row := r.queryRow(
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
	id, err := r.execReturningID(
		`INSERT INTO users (email, display_name, password_hash, program, year_of_study) VALUES (?, ?, ?, ?, ?)`,
		"user_id",
		email, displayName, passwordHash, program, y,
	)
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
	row := r.queryRow(
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

// SearchInstructors searches instructors by name or department.
// Supports filtering by min_rating and department.
// limit ≤ 0 means no cap. offset is 0-based.
// Returns the matching page of instructors plus the total number of matches.
func (r *Repository) SearchInstructors(q, department string, minRating float64, limit, offset int) ([]Instructor, int, error) {
	var whereParts []string
	var args []interface{}

	// Search by name or department
	if q != "" {
		pat := "%" + q + "%"
		whereParts = append(whereParts, "(name LIKE ? OR department LIKE ?)")
		args = append(args, pat, pat)
	}

	// Department filter
	if department != "" && department != "all" {
		whereParts = append(whereParts, "department = ?")
		args = append(args, department)
	}

	// Min rating filter
	if minRating > 0 {
		whereParts = append(whereParts, "ext_avg_rating >= ?")
		args = append(args, minRating)
	}

	where := ""
	if len(whereParts) > 0 {
		where = "WHERE " + strings.Join(whereParts, " AND ")
	}

	// Count total matches
	countQuery := fmt.Sprintf("SELECT COUNT(*) FROM instructors %s", where)
	var total int
	if err := r.queryRow(countQuery, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count instructors: %w", err)
	}

	// Fetch the requested page
	var pageQuery string
	pageArgs := append([]interface{}{}, args...)
	if limit > 0 {
		pageQuery = fmt.Sprintf(`
			SELECT instructor_id, name, department, external_source, external_id, external_url,
			       ext_avg_rating, ext_avg_difficulty, ext_num_ratings, ext_last_scraped
			FROM instructors %s ORDER BY name LIMIT ? OFFSET ?`, where)
		pageArgs = append(pageArgs, limit, offset)
	} else {
		pageQuery = fmt.Sprintf(`
			SELECT instructor_id, name, department, external_source, external_id, external_url,
			       ext_avg_rating, ext_avg_difficulty, ext_num_ratings, ext_last_scraped
			FROM instructors %s ORDER BY name LIMIT -1 OFFSET ?`, where)
		pageArgs = append(pageArgs, offset)
	}

	rows, err := r.query(pageQuery, pageArgs...)
	if err != nil {
		return nil, 0, fmt.Errorf("search instructors: %w", err)
	}
	defer rows.Close()

	out := []Instructor{}
	for rows.Next() {
		var i Instructor
		var dept, extSource, extID, extURL, lastScraped sql.NullString
		var avgRating, avgDiff sql.NullFloat64
		var numRatings sql.NullInt64
		if err := rows.Scan(&i.ID, &i.Name, &dept, &extSource, &extID, &extURL, &avgRating, &avgDiff, &numRatings, &lastScraped); err != nil {
			return nil, 0, err
		}
		i.Department = dept.String
		i.ExternalSource = extSource.String
		i.ExternalID = extID.String
		i.ExternalURL = extURL.String
		if avgRating.Valid {
			i.AvgRating = &avgRating.Float64
		}
		if avgDiff.Valid {
			i.AvgDifficulty = &avgDiff.Float64
		}
		if numRatings.Valid {
			n := int(numRatings.Int64)
			i.NumRatings = &n
		}
		i.LastScraped = lastScraped.String
		out = append(out, i)
	}
	return out, total, rows.Err()
}

// GetInstructorByID fetches a single instructor by their internal ID.
func (r *Repository) GetInstructorByID(id int) (*Instructor, error) {
	row := r.queryRow(`
		SELECT instructor_id, name, department, external_source, external_id, external_url,
		       ext_avg_rating, ext_avg_difficulty, ext_num_ratings, ext_last_scraped
		FROM instructors WHERE instructor_id = ?`, id)
	var i Instructor
	var dept, extSource, extID, extURL, lastScraped sql.NullString
	var avgRating, avgDiff sql.NullFloat64
	var numRatings sql.NullInt64
	if err := row.Scan(&i.ID, &i.Name, &dept, &extSource, &extID, &extURL, &avgRating, &avgDiff, &numRatings, &lastScraped); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	i.Department = dept.String
	i.ExternalSource = extSource.String
	i.ExternalID = extID.String
	i.ExternalURL = extURL.String
	if avgRating.Valid {
		i.AvgRating = &avgRating.Float64
	}
	if avgDiff.Valid {
		i.AvgDifficulty = &avgDiff.Float64
	}
	if numRatings.Valid {
		n := int(numRatings.Int64)
		i.NumRatings = &n
	}
	i.LastScraped = lastScraped.String
	return &i, nil
}

// GetInstructorByExternalID fetches a single instructor by their external ID (e.g., RMP ID).
func (r *Repository) GetInstructorByExternalID(externalID string) (*Instructor, error) {
	row := r.queryRow(`
		SELECT instructor_id, name, department, external_source, external_id, external_url,
		       ext_avg_rating, ext_avg_difficulty, ext_num_ratings, ext_last_scraped
		FROM instructors WHERE external_id = ?`, externalID)
	var i Instructor
	var dept, extSource, extID, extURL, lastScraped sql.NullString
	var avgRating, avgDiff sql.NullFloat64
	var numRatings sql.NullInt64
	if err := row.Scan(&i.ID, &i.Name, &dept, &extSource, &extID, &extURL, &avgRating, &avgDiff, &numRatings, &lastScraped); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	i.Department = dept.String
	i.ExternalSource = extSource.String
	i.ExternalID = extID.String
	i.ExternalURL = extURL.String
	if avgRating.Valid {
		i.AvgRating = &avgRating.Float64
	}
	if avgDiff.Valid {
		i.AvgDifficulty = &avgDiff.Float64
	}
	if numRatings.Valid {
		n := int(numRatings.Int64)
		i.NumRatings = &n
	}
	i.LastScraped = lastScraped.String
	return &i, nil
}

// GetInstructorCourses fetches courses taught by a given instructor.
func (r *Repository) GetInstructorCourses(instructorID int) ([]Course, error) {
	rows, err := r.query(`
		SELECT c.id, c.subject, c.course_number, c.course_name, c.professor, c.term
		FROM courses c
		JOIN course_instructors ci ON c.id = ci.course_row_id
		WHERE ci.instructor_id = ?
		ORDER BY c.subject, c.course_number
	`, instructorID)
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

// GetInstructorsByCourseID fetches all instructors linked to a given course.
func (r *Repository) GetInstructorsByCourseID(courseID int) ([]Instructor, error) {
	rows, err := r.query(`
		SELECT i.instructor_id, i.name, i.department, i.external_source, i.external_id, i.external_url,
		       i.ext_avg_rating, i.ext_avg_difficulty, i.ext_num_ratings, i.ext_last_scraped
		FROM instructors i
		JOIN course_instructors ci ON i.instructor_id = ci.instructor_id
		WHERE ci.course_row_id = ?
		ORDER BY i.name
	`, courseID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []Instructor{}
	for rows.Next() {
		var i Instructor
		var dept, extSource, extID, extURL, lastScraped sql.NullString
		var avgRating, avgDiff sql.NullFloat64
		var numRatings sql.NullInt64
		if err := rows.Scan(&i.ID, &i.Name, &dept, &extSource, &extID, &extURL, &avgRating, &avgDiff, &numRatings, &lastScraped); err != nil {
			return nil, err
		}
		i.Department = dept.String
		i.ExternalSource = extSource.String
		i.ExternalID = extID.String
		i.ExternalURL = extURL.String
		if avgRating.Valid {
			i.AvgRating = &avgRating.Float64
		}
		if avgDiff.Valid {
			i.AvgDifficulty = &avgDiff.Float64
		}
		if numRatings.Valid {
			n := int(numRatings.Int64)
			i.NumRatings = &n
		}
		i.LastScraped = lastScraped.String
		out = append(out, i)
	}
	return out, rows.Err()
}

// GetInstructorsByName fetches instructors matching a professor name using fuzzy matching.
func (r *Repository) GetInstructorsByName(name string) ([]Instructor, error) {
	normalized := strings.ToLower(strings.TrimSpace(name))
	if normalized == "" {
		return nil, nil
	}
	parts := strings.Fields(normalized)
	lastName := parts[len(parts)-1]

	rows, err := r.query(`
		SELECT instructor_id, name, department, external_source, external_id, external_url,
		       ext_avg_rating, ext_avg_difficulty, ext_num_ratings, ext_last_scraped
		FROM instructors
		WHERE name_normalized = ?
		   OR (name_normalized LIKE ? AND substr(name_normalized, 1, 1) = ?)
		ORDER BY name
	`, normalized, "%"+lastName, string(normalized[0]))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []Instructor{}
	for rows.Next() {
		var i Instructor
		var dept, extSource, extID, extURL, lastScraped sql.NullString
		var avgRating, avgDiff sql.NullFloat64
		var numRatings sql.NullInt64
		if err := rows.Scan(&i.ID, &i.Name, &dept, &extSource, &extID, &extURL, &avgRating, &avgDiff, &numRatings, &lastScraped); err != nil {
			return nil, err
		}
		i.Department = dept.String
		i.ExternalSource = extSource.String
		i.ExternalID = extID.String
		i.ExternalURL = extURL.String
		if avgRating.Valid {
			i.AvgRating = &avgRating.Float64
		}
		if avgDiff.Valid {
			i.AvgDifficulty = &avgDiff.Float64
		}
		if numRatings.Valid {
			n := int(numRatings.Int64)
			i.NumRatings = &n
		}
		i.LastScraped = lastScraped.String
		out = append(out, i)
	}
	return out, rows.Err()
}

// GetInstructorWithCourses fetches an instructor with their courses.
func (r *Repository) GetInstructorWithCourses(id int) (*InstructorWithCourses, error) {
	inst, err := r.GetInstructorByID(id)
	if err != nil || inst == nil {
		return nil, err
	}

	courses, err := r.GetInstructorCourses(id)
	if err != nil {
		return nil, err
	}

	return &InstructorWithCourses{
		Instructor: *inst,
		Courses:    courses,
	}, nil
}

// GetAllDepartments returns a list of all distinct departments from instructors.
func (r *Repository) GetAllDepartments() ([]string, error) {
	rows, err := r.query(`
		SELECT DISTINCT department FROM instructors
		WHERE department IS NOT NULL AND department != ''
		ORDER BY department
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var deps []string
	for rows.Next() {
		var d string
		if err := rows.Scan(&d); err != nil {
			return nil, err
		}
		deps = append(deps, d)
	}
	return deps, rows.Err()
}
