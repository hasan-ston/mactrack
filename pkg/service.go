package pkg

// Business logic for courses, professors, reviews

import (
	"fmt"
	"strings"
)

type Service struct {
	Repo *Repository
}

// ValidatePlan takes a user's planned/completed courses and a program's
// requirements, and returns what's satisfied and what's missing.
// This implementation assumes a default unit value per course when unit
// values are not available (defaultUnitsPerCourse = 3).
func (s *Service) ValidatePlan(planItems []PlanItem, program *Program) (ValidationResult, error) {
	const defaultUnitsPerCourse = 3

	// Build set of completed courses (subject + " " + course_number)
	completedSet := map[string]PlanItem{}
	for _, pi := range planItems {
		key := strings.TrimSpace(pi.Subject + " " + pi.CourseNumber)
		if strings.EqualFold(pi.Status, "COMPLETED") {
			completedSet[key] = pi
		}
	}

	// PREREQ CHECK: for each planned or in-progress course, lookup requisites
	prereqWarnings := []PrereqWarning{}
	for _, pi := range planItems {
		statusUpper := strings.ToUpper(pi.Status)
		if statusUpper == "PLANNED" || statusUpper == "IN_PROGRESS" {
			// query requisites for this course
			rows, err := s.Repo.DB.Query(`SELECT req_subject, req_course_number FROM requisites WHERE subject = ? AND course_number = ? AND kind = 'PREREQ'`, pi.Subject, pi.CourseNumber)
			if err != nil {
				return ValidationResult{}, fmt.Errorf("prereq query: %w", err)
			}
			for rows.Next() {
				var rs, rn string
				if err := rows.Scan(&rs, &rn); err != nil {
					rows.Close()
					return ValidationResult{}, err
				}
				need := strings.TrimSpace(rs + " " + rn)
				if _, ok := completedSet[need]; !ok {
					prereqWarnings = append(prereqWarnings, PrereqWarning{Course: strings.TrimSpace(pi.Subject + " " + pi.CourseNumber), MissingPrereq: need})
				}
			}
			rows.Close()
		}
	}

	// CREDITS REMAINING and OR group handling
	totalRequired := 0
	totalCompleted := 0
	groupResults := []GroupResult{}

	var walkGroup func(g RequirementGroup)
	walkGroup = func(g RequirementGroup) {
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

		// iterate courses and handle OR chains
		for i := 0; i < len(g.Courses); i++ {
			rc := g.Courses[i]
			// Determine canonical course code to match against completedSet
			code := strings.TrimSpace(rc.CourseCode)
			matched := false

			if rc.IsOrWithNext {
				// start OR chain
				chain := []RequirementCourse{rc}
				j := i + 1
				for j < len(g.Courses) {
					chain = append(chain, g.Courses[j])
					if !g.Courses[j].IsOrWithNext {
						break
					}
					j++
				}
				// check any in chain completed
				for _, c := range chain {
					key := strings.TrimSpace(c.CourseCode)
					if _, ok := completedSet[key]; ok {
						matched = true
						break
					}
				}
				if matched {
					unitsCompleted += defaultUnitsPerCourse
				} else {
					for _, c := range chain {
						missing = append(missing, strings.TrimSpace(c.CourseCode))
					}
				}
				// advance i to last element of chain
				i = i + len(chain) - 1
				continue
			}

			// normal single course
			if _, ok := completedSet[code]; ok {
				matched = true
			}
			if matched {
				unitsCompleted += defaultUnitsPerCourse
			} else {
				if code != "" {
					missing = append(missing, code)
				}
			}
		}

		// derive satisfied flag
		satisfied := false
		if unitsReq == 0 {
			// if no explicit units required, consider group satisfied if no courses required
			satisfied = len(missing) == 0
		} else {
			satisfied = unitsCompleted >= unitsReq
		}

		if unitsCompleted > 0 {
			totalCompleted += unitsCompleted
		}

		gr := GroupResult{
			Heading:        g.Heading,
			Satisfied:      satisfied,
			UnitsCompleted: unitsCompleted,
			UnitsRequired:  unitsReq,
			MissingCourses: missing,
		}
		groupResults = append(groupResults, gr)

		// Recurse into children groups
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
