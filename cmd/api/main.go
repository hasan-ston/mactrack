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
	http.HandleFunc("/api/courses/", func(w http.ResponseWriter, r *http.Request) {
		// Dispatch requisites: GET /api/courses/<subject>/<number>/requisites
		// e.g. /api/courses/COMPSCI/2ME3/requisites
		if r.Method == http.MethodGet && strings.HasSuffix(r.URL.Path, "/requisites") {
			pkg.CourseRequisitesHandler(repo)(w, r)
			return
		}
		parts := strings.Split(strings.TrimPrefix(r.URL.Path, "/api/courses/"), "/")
		if r.Method == http.MethodGet && len(parts) == 2 && parts[1] != "" {
			pkg.CourseBySubjectNumberHandler(repo)(w, r)
			return
		}

		// Fallback: GET /api/courses/:id — original single-course handler
		pkg.CourseHandler(repo)(w, r)
	})
	http.HandleFunc("/api/programs", pkg.ProgramsHandler(repo))
	http.HandleFunc("/api/programs/", pkg.ProgramRequirementsHandler(repo))
	http.HandleFunc("/api/users/", func(w http.ResponseWriter, r *http.Request) {
		// Dispatch plan endpoints under /api/users/:id/plan
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
