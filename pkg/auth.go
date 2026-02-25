package pkg

import (
	"context"
	"errors"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// jwtSecret is loaded from the JWT_SECRET env var.
// In production, set this to a long random string and never commit it.
var jwtSecret = []byte(getEnvOrDefault("JWT_SECRET", "dev-secret-change-me"))

func getEnvOrDefault(key, fallback string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return fallback
}

// TokenType distinguishes access tokens from refresh tokens.
// We embed this in the claims so we can reject a refresh token
// being used where an access token is expected, and vice versa.
type TokenType string

const (
	AccessToken  TokenType = "access"
	RefreshToken TokenType = "refresh"
)

// Claims is the payload embedded in every JWT.
type Claims struct {
	UserID    int       `json:"user_id"`
	Email     string    `json:"email"`
	TokenType TokenType `json:"token_type"`
	jwt.RegisteredClaims
}

// GenerateAccessToken creates a short-lived JWT (15 minutes).
// This is what the frontend sends on every API request.
func GenerateAccessToken(userID int, email string) (string, error) {
	claims := Claims{
		UserID:    userID,
		Email:     email,
		TokenType: AccessToken,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(15 * time.Minute)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(jwtSecret)
}

// GenerateRefreshToken creates a longer-lived JWT (7 days).
// The frontend stores this and uses it to get a new access token
// when the access token expires — without requiring a re-login.
func GenerateRefreshToken(userID int, email string) (string, error) {
	claims := Claims{
		UserID:    userID,
		Email:     email,
		TokenType: RefreshToken,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(7 * 24 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(jwtSecret)
}

// ParseToken validates a JWT string and returns its claims.
// Returns an error if the token is expired, tampered with, or malformed.
func ParseToken(tokenStr string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenStr, &Claims{}, func(t *jwt.Token) (interface{}, error) {
		// Ensure the signing method is what we expect — reject anything else
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("unexpected signing method")
		}
		return jwtSecret, nil
	})
	if err != nil {
		return nil, err
	}

	claims, ok := token.Claims.(*Claims)
	if !ok || !token.Valid {
		return nil, errors.New("invalid token")
	}
	return claims, nil
}

// --- MIDDLEWARE ---

// contextKey is a private type for storing values in request context.
// Using a custom type prevents collisions with other packages.
type contextKey string

const claimsContextKey contextKey = "claims"

// RequireAuth is an HTTP middleware that:
// 1. Reads the Authorization header (expects "Bearer <token>")
// 2. Validates the JWT
// 3. Rejects refresh tokens (they can only be used on /api/auth/refresh)
// 4. Stores the claims in the request context for downstream handlers
func RequireAuth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			http.Error(w, "missing Authorization header", http.StatusUnauthorized)
			return
		}

		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) != 2 || parts[0] != "Bearer" {
			http.Error(w, "invalid Authorization header format", http.StatusUnauthorized)
			return
		}

		claims, err := ParseToken(parts[1])
		if err != nil {
			http.Error(w, "invalid or expired token", http.StatusUnauthorized)
			return
		}

		if claims.TokenType != AccessToken {
			http.Error(w, "access token required", http.StatusUnauthorized)
			return
		}

		// Store claims in context so any downstream handler can read the logged-in user's ID
		next(w, withClaims(r, claims))
	}
}

// withClaims attaches JWT claims to the request's context and returns the
// updated request. This is used by the RequireAuth middleware so downstream
// handlers can retrieve the logged-in user's claims.
func withClaims(r *http.Request, claims *Claims) *http.Request {
	ctx := context.WithValue(r.Context(), claimsContextKey, claims)
	return r.WithContext(ctx)
}

// GetClaimsFromContext retrieves the JWT claims stored by RequireAuth middleware.
// Returns nil if not present (shouldn't happen on protected routes).
func GetClaimsFromContext(r *http.Request) *Claims {
	claims, _ := r.Context().Value(claimsContextKey).(*Claims)
	return claims
}
