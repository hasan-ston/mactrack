package pkg

// Core models for Course, Professor, Review

type Course struct {
	ID   int
	Name string
	Description string
	Prereqs []int
	Coreqs []int
}

type Professor struct {
	ID   int
	Name string
	Courses []int
}

type Review struct {
	ID         int
	TargetType string // "course" or "professor"
	TargetID   int
	Content    string
	Rating     float64
	Difficulty float64
}
