package pkg

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
