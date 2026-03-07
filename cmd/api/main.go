package main

import (
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"mactrack/pkg"

	"github.com/joho/godotenv"
)

func init() {
	// Load .env if present (ignored in production where vars come from the environment).
	if err := godotenv.Load(); err != nil {
		log.Println("no .env file found, using environment variables")
	}
}

func main() {
	// DATABASE_URL accepts a full PostgreSQL DSN (postgres://...) for production
	// or a SQLite file path for local development without Postgres.
	// Prefer DATABASE_URL; fall back to legacy MACTRACK_DB, then default SQLite file.
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		dsn = os.Getenv("MACTRACK_DB")
	}
	if dsn == "" {
		dsn = "database/courses.db"
	}

	repo, err := pkg.NewRepository(dsn)
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
	http.HandleFunc("/api/auth/forgot-password", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.NotFound(w, r)
			return
		}
		pkg.ForgotPasswordHandler(repo)(w, r)
	})
	http.HandleFunc("/api/auth/reset-password", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.NotFound(w, r)
			return
		}
		pkg.ResetPasswordHandler(repo)(w, r)
	})

	// --- Course routes (public) ---
	http.HandleFunc("/api/courses", pkg.CoursesHandler(repo))
	http.HandleFunc("/api/courses/", func(w http.ResponseWriter, r *http.Request) {
		// Dispatch requisites: GET /api/courses/<subject>/<number>/requisites
		if r.Method == http.MethodGet && strings.HasSuffix(r.URL.Path, "/requisites") {
			pkg.CourseRequisitesHandler(repo)(w, r)
			return
		}

		// Dispatch: GET /api/courses/:id/instructors
		if r.Method == http.MethodGet && strings.HasSuffix(r.URL.Path, "/instructors") {
			pkg.CourseInstructorsHandler(repo)(w, r)
			return
		}

		// Dispatch by subject+number: GET /api/courses/<subject>/<number>
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

	// --- Instructor routes (public) ---
	http.HandleFunc("/api/instructors", pkg.InstructorsHandler(repo))
	http.HandleFunc("/api/instructors/", func(w http.ResponseWriter, r *http.Request) {
		// Dispatch: GET /api/instructors/departments
		if r.Method == http.MethodGet && r.URL.Path == "/api/instructors/departments" {
			pkg.DepartmentsHandler(repo)(w, r)
			return
		}

		// Dispatch: GET /api/instructors/external/:external_id
		if r.Method == http.MethodGet && strings.HasPrefix(strings.TrimPrefix(r.URL.Path, "/api/instructors/"), "external/") {
			pkg.InstructorByExternalIDHandler(repo)(w, r)
			return
		}

		// Dispatch: GET /api/instructors/:id/courses
		if r.Method == http.MethodGet && strings.HasSuffix(r.URL.Path, "/courses") {
			pkg.InstructorCoursesHandler(repo)(w, r)
			return
		}

		// Fallback: GET /api/instructors/:id
		pkg.InstructorHandler(repo)(w, r)
	})

	// --- User/plan routes (protected — JWT required) ---
	http.HandleFunc("/api/users/", func(w http.ResponseWriter, r *http.Request) {
		// GPA endpoint: GET /api/users/:id/gpa
		// Must be checked before /plan to avoid prefix conflicts
		if strings.HasSuffix(r.URL.Path, "/gpa") {
			pkg.RequireAuth(pkg.RequireOwner(pkg.GetUserGPAHandler(repo)))(w, r)

			return
		}

		// Year advance: POST /api/users/:id/advance-year
		if strings.HasSuffix(r.URL.Path, "/advance-year") {
			pkg.RequireAuth(pkg.RequireOwner(pkg.PostAdvanceYearHandler(repo)))(w, r)
			return
		}

		// Profile update: PATCH /api/users/:id  (bare — no sub-path)
		idPart := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/users/"), "/")
		if r.Method == http.MethodPatch && !strings.Contains(idPart, "/") {
			pkg.RequireAuth(pkg.RequireOwner(pkg.PatchUserProfileHandler(repo)))(w, r)
			return
		}

		// Validation route: GET /api/users/:id/validation
		if strings.HasSuffix(r.URL.Path, "/validation") {
			pkg.RequireAuth(pkg.RequireOwner(pkg.GetUserValidationHandler(repo, svc)))(w, r)

			return
		}

		// Plan collection: GET or POST /api/users/:id/plan
		if strings.HasSuffix(r.URL.Path, "/plan") {
			switch r.Method {
			case http.MethodGet:
				pkg.RequireAuth(pkg.RequireOwner(pkg.GetUserPlanHandler(repo, svc)))(w, r)

			case http.MethodPost:
				pkg.RequireAuth(pkg.RequireOwner(pkg.PostUserPlanHandler(repo)))(w, r)

			default:
				http.NotFound(w, r)
			}
			return
		}

		// Plan item: PATCH or DELETE /api/users/:id/plan/:itemId
		if strings.Contains(r.URL.Path, "/plan/") {
			switch r.Method {
			case http.MethodPatch:
				// PATCH updates status + grade of a single plan item
				pkg.RequireAuth(pkg.RequireOwner(pkg.PatchUserPlanItemHandler(repo)))(w, r)
			case http.MethodDelete:
				pkg.RequireAuth(pkg.RequireOwner(pkg.DeleteUserPlanItemHandler(repo)))(w, r)
			default:
				http.NotFound(w, r)
			}
			return
		}

		http.NotFound(w, r)
	})

	// --- Feedback route (public — sends an email to the team) ---
	http.HandleFunc("/api/feedback", pkg.FeedbackHandler())

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

	log.Printf("starting server on %s (db=%s)", addr, dsn)
	if err := srv.ListenAndServe(); err != nil {
		log.Fatalf("server error: %v", err)
	}
}
