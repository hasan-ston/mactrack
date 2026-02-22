package main

import (
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"mactrack/pkg"
)

func main() {
	dbPath := "database/courses.db"
	if env := os.Getenv("MACTRACK_DB"); env != "" {
		dbPath = env
	}

	repo, err := pkg.NewRepository(dbPath)
	if err != nil {
		log.Fatalf("failed to open repository: %v", err)
	}
	defer repo.Close()

	// Service
	svc := &pkg.Service{Repo: repo}

	// Routes
	http.HandleFunc("/api/courses", pkg.CoursesHandler(repo))
	http.HandleFunc("/api/courses/", pkg.CourseHandler(repo))
	http.HandleFunc("/api/programs", pkg.ProgramsHandler(repo))
	http.HandleFunc("/api/programs/", pkg.ProgramRequirementsHandler(repo))
	http.HandleFunc("/api/users/", func(w http.ResponseWriter, r *http.Request) {
		// dispatch plan endpoints under /api/users/:id/plan
		if strings.HasSuffix(r.URL.Path, "/plan") {
			if r.Method == http.MethodGet {
				pkg.GetUserPlanHandler(repo, svc)(w, r)
				return
			} else if r.Method == http.MethodPost {
				pkg.PostUserPlanHandler(repo)(w, r)
				return
			}
		}
		http.NotFound(w, r)
	})

	addr := ":8080"
	if a := os.Getenv("PORT"); a != "" {
		addr = ":" + a
	}

	srv := &http.Server{
		Addr:         addr,
		ReadTimeout:  5 * time.Second,
		WriteTimeout: 10 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	log.Printf("starting server on %s (db=%s)", addr, dbPath)
	if err := srv.ListenAndServe(); err != nil {
		log.Fatalf("server error: %v", err)
	}
}
