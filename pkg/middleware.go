package pkg

// Middleware (logging, CORS, auth)

import "net/http"

// CORS wraps a handler and adds permissive CORS headers so the frontend
// (served from a different origin, e.g. Cloudflare Pages) can call the API.
// In production you may want to restrict Access-Control-Allow-Origin to your
// specific Pages domain instead of reflecting the request origin.
func CORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
