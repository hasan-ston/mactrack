package pkg

import (
	"net/http"
	"net/url"
	"strings"
)

// NewMux builds and returns the application's HTTP router.
// It is shared by both the long-running server (cmd/api) and the
// AWS Lambda entry point (cmd/lambda) so both deployments behave identically.
func NewMux(repo *Repository, svc *Service) http.Handler {
	mux := http.NewServeMux()

	// --- Auth routes (public — no JWT required) ---
	mux.HandleFunc("/api/auth/register", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.NotFound(w, r)
			return
		}
		RegisterHandler(repo)(w, r)
	})
	mux.HandleFunc("/api/auth/login", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.NotFound(w, r)
			return
		}
		LoginHandler(repo)(w, r)
	})
	mux.HandleFunc("/api/auth/refresh", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.NotFound(w, r)
			return
		}
		RefreshHandler()(w, r)
	})
	mux.HandleFunc("/api/auth/forgot-password", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.NotFound(w, r)
			return
		}
		ForgotPasswordHandler(repo)(w, r)
	})
	mux.HandleFunc("/api/auth/reset-password", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.NotFound(w, r)
			return
		}
		ResetPasswordHandler(repo)(w, r)
	})

	// --- Course routes (public) ---
	mux.HandleFunc("/api/courses", CoursesHandler(repo))
	mux.HandleFunc("/api/courses/", func(w http.ResponseWriter, r *http.Request) {
		// Dispatch requisites: GET /api/courses/<subject>/<number>/requisites
		if r.Method == http.MethodGet && strings.HasSuffix(r.URL.Path, "/requisites") {
			CourseRequisitesHandler(repo)(w, r)
			return
		}

		// Dispatch: GET /api/courses/:id/instructors
		if r.Method == http.MethodGet && strings.HasSuffix(r.URL.Path, "/instructors") {
			CourseInstructorsHandler(repo)(w, r)
			return
		}

		// Dispatch by subject+number: GET /api/courses/<subject>/<number>
		parts := strings.Split(strings.TrimPrefix(r.URL.Path, "/api/courses/"), "/")
		if r.Method == http.MethodGet && len(parts) == 2 && parts[1] != "" {
			CourseBySubjectNumberHandler(repo)(w, r)
			return
		}

		// Fallback: GET /api/courses/:id
		CourseHandler(repo)(w, r)
	})

	// --- Program routes (public) ---
	mux.HandleFunc("/api/programs", ProgramsHandler(repo))
	mux.HandleFunc("/api/programs/", ProgramRequirementsHandler(repo))

	// --- Instructor routes (public) ---
	mux.HandleFunc("/api/instructors", InstructorsHandler(repo))
	mux.HandleFunc("/api/instructors/", func(w http.ResponseWriter, r *http.Request) {
		// Dispatch: GET /api/instructors/departments
		if r.Method == http.MethodGet && r.URL.Path == "/api/instructors/departments" {
			DepartmentsHandler(repo)(w, r)
			return
		}

		// Dispatch: GET /api/instructors/external/:external_id
		if r.Method == http.MethodGet && strings.HasPrefix(strings.TrimPrefix(r.URL.Path, "/api/instructors/"), "external/") {
			InstructorByExternalIDHandler(repo)(w, r)
			return
		}

		// Dispatch: GET /api/instructors/:id/courses
		if r.Method == http.MethodGet && strings.HasSuffix(r.URL.Path, "/courses") {
			InstructorCoursesHandler(repo)(w, r)
			return
		}

		// Fallback: GET /api/instructors/:id
		InstructorHandler(repo)(w, r)
	})

	// --- User/plan routes (protected — JWT required) ---
	mux.HandleFunc("/api/users/", func(w http.ResponseWriter, r *http.Request) {
		// GPA endpoint: GET /api/users/:id/gpa
		if strings.HasSuffix(r.URL.Path, "/gpa") {
			RequireAuth(RequireOwner(GetUserGPAHandler(repo)))(w, r)
			return
		}

		// Year advance: POST /api/users/:id/advance-year
		if strings.HasSuffix(r.URL.Path, "/advance-year") {
			RequireAuth(RequireOwner(PostAdvanceYearHandler(repo)))(w, r)
			return
		}

		// Profile update: PATCH /api/users/:id (bare — no sub-path)
		idPart := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/users/"), "/")
		if r.Method == http.MethodPatch && !strings.Contains(idPart, "/") {
			RequireAuth(RequireOwner(PatchUserProfileHandler(repo)))(w, r)
			return
		}

		// Validation route: GET /api/users/:id/validation
		if strings.HasSuffix(r.URL.Path, "/validation") {
			RequireAuth(RequireOwner(GetUserValidationHandler(repo, svc)))(w, r)
			return
		}

		// Plan collection: GET or POST /api/users/:id/plan
		if strings.HasSuffix(r.URL.Path, "/plan") {
			switch r.Method {
			case http.MethodGet:
				RequireAuth(RequireOwner(GetUserPlanHandler(repo, svc)))(w, r)
			case http.MethodPost:
				RequireAuth(RequireOwner(PostUserPlanHandler(repo)))(w, r)
			default:
				http.NotFound(w, r)
			}
			return
		}

		// Plan item: PATCH or DELETE /api/users/:id/plan/:itemId
		if strings.Contains(r.URL.Path, "/plan/") {
			switch r.Method {
			case http.MethodPatch:
				RequireAuth(RequireOwner(PatchUserPlanItemHandler(repo)))(w, r)
			case http.MethodDelete:
				RequireAuth(RequireOwner(DeleteUserPlanItemHandler(repo)))(w, r)
			default:
				http.NotFound(w, r)
			}
			return
		}

		http.NotFound(w, r)
	})

	// --- Feedback route (public) ---
	mux.HandleFunc("/api/feedback", FeedbackHandler())

	// Normalize incoming paths to strip a leading stage prefix (e.g. "/prod")
	// when the remainder starts with "/api/...". API Gateway often includes
	// the stage in the path (depending on URL used), which would prevent the
	// local mux from matching routes registered under "/api/...".
	normalize := func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			p := r.URL.Path
			if !strings.HasPrefix(p, "/api/") {
				// remove a single leading segment and test again
				t := strings.TrimPrefix(p, "/")
				parts := strings.SplitN(t, "/", 2)
				if len(parts) == 2 && strings.HasPrefix("/"+parts[1], "/api/") {
					// clone request and adjust URL.Path
					nr := new(http.Request)
					*nr = *r
					nr.URL = newCopyURL(r.URL)
					nr.URL.Path = "/" + parts[1]
					r = nr
				}
			}
			next.ServeHTTP(w, r)
		})
	}

	return normalize(mux)
}

// newCopyURL returns a shallow copy of the provided URL so modifications
// won't affect the original request URL used elsewhere by AWS adapters.
func newCopyURL(u *url.URL) *url.URL {
	nu := *u
	return &nu
}
