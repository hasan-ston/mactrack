package pkg

// Middleware (logging, CORS, auth)

import (
	"net/http"
	"os"
	"strings"
)

// CORSMiddleware wraps a handler and adds Cross-Origin Resource Sharing
// headers so the React frontend (served from Cloudflare Pages) can call
// the API from a different origin.
//
// Allowed origins are controlled by the ALLOWED_ORIGINS environment variable
// (comma-separated list, e.g. "https://mactrack.pages.dev,https://mactrack.ca").
// When the variable is unset the middleware reflects any origin back — this is
// intentional for local development where CORS restrictions are not needed.
func CORSMiddleware(next http.Handler) http.Handler {
	// Build the allow-list once at startup.
	var allowList []string
	if raw := os.Getenv("ALLOWED_ORIGINS"); raw != "" {
		for _, o := range strings.Split(raw, ",") {
			if trimmed := strings.TrimSpace(o); trimmed != "" {
				allowList = append(allowList, trimmed)
			}
		}
	}

	isAllowed := func(origin string) bool {
		if len(allowList) == 0 {
			return true // dev: allow everything when no allow-list is set
		}
		for _, o := range allowList {
			if o == origin {
				return true
			}
		}
		return false
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		switch {
		case origin != "" && isAllowed(origin):
			w.Header().Set("Access-Control-Allow-Origin", origin)
		case len(allowList) == 0:
			// Development fallback: reflect any origin.
			w.Header().Set("Access-Control-Allow-Origin", "*")
		}

		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		w.Header().Set("Access-Control-Max-Age", "86400")

		// Respond to preflight immediately — do not pass to the next handler.
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}
