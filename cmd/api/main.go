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

	// --- Auth routes (public — no JWT required) ---
	http.HandleFunc("/api/auth/register", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.NotFound(w, r)
			return
		}
		pkg.RegisterHandler(repo)(w, r)
	})
	http.HandleFunc("/api/auth/login", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.NotFound(w, r)
			return
		}
		pkg.LoginHandler(repo)(w, r)
	})
	http.HandleFunc("/api/auth/refresh", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.NotFound(w, r)
			return
		}
		pkg.RefreshHandler()(w, r)
	})

	// --- Course routes (public) ---
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

	// --- Program routes (public) ---
	http.HandleFunc("/api/programs", pkg.ProgramsHandler(repo))
	http.HandleFunc("/api/programs/", pkg.ProgramRequirementsHandler(repo))

	// --- User/plan routes (protected — JWT required) ---
	http.HandleFunc("/api/users/", func(w http.ResponseWriter, r *http.Request) {
		// Dispatch plan endpoints under /api/users/:id/plan
		if strings.HasSuffix(r.URL.Path, "/plan") {
			switch r.Method {
			case http.MethodGet:
				// RequireAuth wraps the handler — rejects requests with missing/invalid token
				pkg.RequireAuth(pkg.GetUserPlanHandler(repo, svc))(w, r)
			case http.MethodPost:
				pkg.RequireAuth(pkg.PostUserPlanHandler(repo))(w, r)
			default:
				http.NotFound(w, r)
			}
			return
		}

		// DELETE /api/users/:id/plan/:itemId — remove a plan item (TODO from handoff notes)
		if r.Method == http.MethodDelete && strings.Contains(r.URL.Path, "/plan/") {
			pkg.RequireAuth(pkg.DeleteUserPlanItemHandler(repo))(w, r)
			return
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
