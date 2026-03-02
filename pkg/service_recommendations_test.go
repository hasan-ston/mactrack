package pkg

import (
	"testing"

	_ "github.com/mattn/go-sqlite3"
)

func TestRecommendCourses_PrioritizesYearLevelForUpperYearStudents(t *testing.T) {
	repo, err := NewRepository(":memory:")
	if err != nil {
		t.Fatalf("new repo: %v", err)
	}
	defer repo.Close()

	stmts := []string{
		`CREATE TABLE requisites (subject TEXT, course_number TEXT, req_subject TEXT, req_course_number TEXT, kind TEXT, note TEXT);`,
	}
	for _, s := range stmts {
		if _, err := repo.DB.Exec(s); err != nil {
			t.Fatalf("exec schema: %v", err)
		}
	}

	svc := &Service{Repo: repo}
	program := &Program{Groups: []RequirementGroup{{
		Heading: "Core",
		Courses: []RequirementCourse{
			{CourseCode: "COMPSCI 1JC3"},
			{CourseCode: "COMPSCI 2C03"},
			{CourseCode: "COMPSCI 2S03"},
		},
	}}}

	planItems := []PlanItem{{Subject: "COMPSCI", CourseNumber: "1MD3", Status: "COMPLETED"}}
	recs, err := svc.RecommendCourses(planItems, program, 2, 3)
	if err != nil {
		t.Fatalf("recommend: %v", err)
	}
	if len(recs) == 0 {
		t.Fatalf("expected recommendations")
	}
	if recs[0].CourseLevel < 2 {
		t.Fatalf("expected first recommendation to be level 2+, got %v", recs[0])
	}
}

func TestRecommendCourses_FallsBackToLowerLevelWhenNeeded(t *testing.T) {
	repo, err := NewRepository(":memory:")
	if err != nil {
		t.Fatalf("new repo: %v", err)
	}
	defer repo.Close()

	if _, err := repo.DB.Exec(`CREATE TABLE requisites (subject TEXT, course_number TEXT, req_subject TEXT, req_course_number TEXT, kind TEXT, note TEXT);`); err != nil {
		t.Fatalf("exec schema: %v", err)
	}

	svc := &Service{Repo: repo}
	program := &Program{Groups: []RequirementGroup{{
		Heading: "Core",
		Courses: []RequirementCourse{{CourseCode: "MATH 1A03"}},
	}}}

	recs, err := svc.RecommendCourses(nil, program, 2, 3)
	if err != nil {
		t.Fatalf("recommend: %v", err)
	}
	if len(recs) != 1 {
		t.Fatalf("expected one recommendation, got %d", len(recs))
	}
	if recs[0].CourseCode != "MATH 1A03" {
		t.Fatalf("unexpected course: %s", recs[0].CourseCode)
	}
}
