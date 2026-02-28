package pkg

import "strconv"

// Core models for Course, Professor, Review

type Course struct {
	ID           int    `json:"id"`
	Subject      string `json:"subject"`
	CourseNumber string `json:"course_number"`
	CourseName   string `json:"course_name"`
	Professor    string `json:"professor"`
	Term         string `json:"term"`
}

type Professor struct {
	ID      int    `json:"id"`
	Name    string `json:"name"`
	Courses []int  `json:"courses"`
}

type Review struct {
	ID         int     `json:"id"`
	TargetType string  `json:"target_type"` // "course" or "professor"
	TargetID   int     `json:"target_id"`
	Content    string  `json:"content"`
	Rating     float64 `json:"rating"`
	Difficulty float64 `json:"difficulty"`
}

// Degree planner models
type Program struct {
	ProgramID   int                `json:"program_id"`
	POID        int                `json:"poid"`
	Name        string             `json:"name"`
	DegreeType  string             `json:"degree_type"`
	TotalUnits  *int               `json:"total_units"`
	CatalogYear string             `json:"catalog_year"`
	Groups      []RequirementGroup `json:"groups"`
}

type RequirementGroup struct {
	GroupID         int                 `json:"group_id"`
	ProgramID       int                 `json:"program_id"`
	ParentGroupID   *int                `json:"parent_group_id"`
	DisplayOrder    int                 `json:"display_order"`
	Heading         string              `json:"heading"`
	HeadingLevel    int                 `json:"heading_level"`
	UnitsRequired   *int                `json:"units_required"`
	CoursesRequired *int                `json:"courses_required"`
	IsElective      bool                `json:"is_elective"`
	IsContainer     bool                `json:"is_container"`
	Children        []RequirementGroup  `json:"children"`
	Courses         []RequirementCourse `json:"courses"`
}

type RequirementCourse struct {
	ReqCourseID  int     `json:"req_course_id"`
	GroupID      int     `json:"group_id"`
	DisplayOrder int     `json:"display_order"`
	Coid         *int    `json:"coid"`
	CourseCode   string  `json:"course_code"`
	CourseName   string  `json:"course_name"`
	IsOrWithNext bool    `json:"is_or_with_next"`
	AdhocText    *string `json:"adhoc_text"`
}

type PlanItem struct {
	PlanItemID   int     `json:"plan_item_id"`
	PlanTermID   int     `json:"plan_term_id"`
	Subject      string  `json:"subject"`
	CourseNumber string  `json:"course_number"`
	Status       string  `json:"status"`
	Grade        *string `json:"grade"`
	Note         *string `json:"note"`
}

// Validation result shapes
type PrereqWarning struct {
	Course        string `json:"course"`
	MissingPrereq string `json:"missing_prereq"`
}

type GroupResult struct {
	Heading        string   `json:"heading"`
	Satisfied      bool     `json:"satisfied"`
	UnitsCompleted int      `json:"units_completed"`
	UnitsRequired  int      `json:"units_required"`
	MissingCourses []string `json:"missing_courses"`
}

type ValidationResult struct {
	TotalUnitsRequired  int             `json:"total_units_required"`
	TotalUnitsCompleted int             `json:"total_units_completed"`
	UnitsRemaining      int             `json:"units_remaining"`
	Groups              []GroupResult   `json:"groups"`
	PrereqWarnings      []PrereqWarning `json:"prereq_warnings"`
}

func UnitsFromCourseNumber(courseNumber string, defaultUnits int) int {
	if len(courseNumber) < 2 {
		return defaultUnits
	}
	// Last two characters are the unit count
	suffix := courseNumber[len(courseNumber)-2:]
	n, err := strconv.Atoi(suffix)
	if err != nil || n == 0 {
		return defaultUnits
	}
	return n
}
