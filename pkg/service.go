package pkg

// Business logic for courses, professors, reviews

import (
	"fmt"
	"strconv"
	"strings"
)

type Service struct {
	Repo *Repository
}

func unitsFromCourseNumber(courseNumber string, defaultUnits int) int {
	if len(courseNumber) < 2 {
		return defaultUnits
	}
	// Last two characters encode the unit count
	suffix := courseNumber[len(courseNumber)-2:]
	n, err := strconv.Atoi(suffix)
	if err != nil || n == 0 {
		return defaultUnits
	}
	return n
}

func (s *Service) ValidatePlan(planItems []PlanItem, program *Program) (ValidationResult, error) {
	// Fallback unit value when the course number suffix can't be parsed
	const defaultUnitsPerCourse = 3

	// Build set of completed courses keyed as "SUBJECT COURSENUMBER"
	// e.g. "COMPSCI 2C03", "ENGINEER 1P13"
	completedSet := map[string]PlanItem{}
	for _, pi := range planItems {
		key := strings.TrimSpace(pi.Subject + " " + pi.CourseNumber)
		if strings.EqualFold(pi.Status, "COMPLETED") {
			completedSet[key] = pi
		}
	}
	
	prereqWarnings := []PrereqWarning{}
	for _, pi := range planItems {
		statusUpper := strings.ToUpper(pi.Status)
		if statusUpper != "PLANNED" && statusUpper != "IN_PROGRESS" {
			continue
		}

		rows, err := s.Repo.DB.Query(`
			SELECT req_subject, req_course_number 
			FROM requisites 
			WHERE subject = ? AND course_number = ? AND kind = 'PREREQ'`,
			pi.Subject, pi.CourseNumber)
		if err != nil {
			return ValidationResult{}, fmt.Errorf("prereq query: %w", err)
		}

		var prereqs []string
		for rows.Next() {
			var rs, rn string
			if err := rows.Scan(&rs, &rn); err != nil {
				rows.Close()
				return ValidationResult{}, err
			}
			prereqs = append(prereqs, strings.TrimSpace(rs+" "+rn))
		}
		rows.Close()

		// Only warn if there are prereqs AND none of them are completed.
		// If any single prereq is done, the requirement is satisfied.
		if len(prereqs) > 0 {
			anyCompleted := false
			for _, need := range prereqs {
				if _, ok := completedSet[need]; ok {
					anyCompleted = true
					break
				}
			}
			if !anyCompleted {
				// Show all options so the student knows what they can take
				prereqWarnings = append(prereqWarnings, PrereqWarning{
					Course:        strings.TrimSpace(pi.Subject + " " + pi.CourseNumber),
					MissingPrereq: strings.Join(prereqs, " or "),
				})
			}
		}
	}

	// REQUIREMENT GROUP VALIDATION
	totalRequired := 0
	totalCompleted := 0
	groupResults := []GroupResult{}

	var walkGroup func(g RequirementGroup)
	walkGroup = func(g RequirementGroup) {
		// Container groups (headings like "Level II: 30 Units") have no direct
		// courses — just recurse into their children and skip adding a result row.
		if g.IsContainer || (len(g.Courses) == 0 && len(g.Children) > 0) {
			for _, child := range g.Children {
				walkGroup(child)
			}
			return
		}

		// Determine how many units this group requires.
		// Prefer units_required; fall back to courses_required × default units.
		unitsReq := 0
		if g.UnitsRequired != nil {
			unitsReq = *g.UnitsRequired
		} else if g.CoursesRequired != nil {
			unitsReq = (*g.CoursesRequired) * defaultUnitsPerCourse
		}
		if unitsReq > 0 {
			totalRequired += unitsReq
		}

		unitsCompleted := 0
		missing := []string{}

		// Walk courses in order, handling OR chains (is_or_with_next flag).
		// An OR chain means the student needs to complete any ONE of the linked
		// courses — e.g. "MATH 1B03 or MATH 1ZA3 or MATH 1ZB3".
		for i := 0; i < len(g.Courses); i++ {
			rc := g.Courses[i]
			code := strings.TrimSpace(rc.CourseCode)

			if rc.IsOrWithNext {
				// Collect the full OR chain starting at this course
				chain := []RequirementCourse{rc}
				j := i + 1
				for j < len(g.Courses) {
					chain = append(chain, g.Courses[j])
					if !g.Courses[j].IsOrWithNext {
						break
					}
					j++
				}

				// OR chain is satisfied if ANY course in it is completed
				matched := false
				var matchedCode string
				for _, c := range chain {
					key := strings.TrimSpace(c.CourseCode)
					if _, ok := completedSet[key]; ok {
						matched = true
						matchedCode = key
						break
					}
				}

				if matched {
					// Use the actual unit value of the completed course
					units := unitsFromCourseNumber(
						strings.TrimSpace(strings.SplitN(matchedCode, " ", 2)[1]),
						defaultUnitsPerCourse,
					)
					unitsCompleted += units
				} else {
					// None completed — add all options to missing list
					for _, c := range chain {
						if c.CourseCode != "" {
							missing = append(missing, strings.TrimSpace(c.CourseCode))
						}
					}
				}

				// Advance past the entire chain
				i = i + len(chain) - 1
				continue
			}

			// Single required course (no OR alternative)
			if _, ok := completedSet[code]; ok {
				// Parse units from the course number suffix (e.g. "1P13" → 13)
				units := unitsFromCourseNumber(strings.SplitN(rc.CourseCode, " ", 2)[1], defaultUnitsPerCourse)
				unitsCompleted += units
			} else {
				if code != "" {
					missing = append(missing, code)
				}
			}
		}

		// Group is satisfied when completed units meet or exceed the requirement.
		// If no explicit unit requirement, satisfied means no missing courses.
		satisfied := false
		if unitsReq == 0 {
			satisfied = len(missing) == 0
		} else {
			satisfied = unitsCompleted >= unitsReq
		}

		if unitsCompleted > 0 {
			totalCompleted += unitsCompleted
		}

		groupResults = append(groupResults, GroupResult{
			Heading:        g.Heading,
			Satisfied:      satisfied,
			UnitsCompleted: unitsCompleted,
			UnitsRequired:  unitsReq,
			MissingCourses: missing,
		})

		// Recurse into any child groups (some leaf groups still have children)
		for _, child := range g.Children {
			walkGroup(child)
		}
	}

	for _, root := range program.Groups {
		walkGroup(root)
	}

	unitsRemaining := totalRequired - totalCompleted
	if unitsRemaining < 0 {
		unitsRemaining = 0
	}

	return ValidationResult{
		TotalUnitsRequired:  totalRequired,
		TotalUnitsCompleted: totalCompleted,
		UnitsRemaining:      unitsRemaining,
		Groups:              groupResults,
		PrereqWarnings:      prereqWarnings,
	}, nil
}