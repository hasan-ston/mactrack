package pkg

import (
	"encoding/json"
	"net/http"
	"strings"

	"golang.org/x/crypto/bcrypt"
)

// --- REQUEST / RESPONSE SHAPES ---

type RegisterRequest struct {
	Email       string  `json:"email"`
	Password    string  `json:"password"`
	DisplayName string  `json:"display_name"`
	Program     *string `json:"program"`
	YearOfStudy *int    `json:"year_of_study"`
}

type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type AuthResponse struct {
	AccessToken  string  `json:"access_token"`
	RefreshToken string  `json:"refresh_token"`
	UserID       int     `json:"user_id"`
	Email        string  `json:"email"`
	DisplayName  string  `json:"display_name"`
	Program      *string `json:"program"`
	YearOfStudy  *int    `json:"year_of_study"`
}

type RefreshRequest struct {
	RefreshToken string `json:"refresh_token"`
}

// RegisterHandler handles POST /api/auth/register.
// Matches the existing handler factory pattern: takes repo, returns http.HandlerFunc.
func RegisterHandler(repo *Repository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req RegisterRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}

		// Normalise email
		req.Email = strings.TrimSpace(strings.ToLower(req.Email))
		if req.Email == "" || req.Password == "" || req.DisplayName == "" {
			http.Error(w, "email, password, and display_name are required", http.StatusBadRequest)
			return
		}

		if len(req.Password) < 8 {
			http.Error(w, "password must be at least 8 characters", http.StatusBadRequest)
			return
		}

		// Reject duplicate emails
		existing, _ := repo.GetUserByEmail(req.Email)
		if existing != nil {
			http.Error(w, "email already in use", http.StatusConflict)
			return
		}

		// Hash password with bcrypt (cost 12 = good balance of speed vs security)
		hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), 12)
		if err != nil {
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}

		user, err := repo.CreateUser(req.Email, req.DisplayName, string(hash), req.Program, req.YearOfStudy)
		if err != nil {
			http.Error(w, "failed to create user", http.StatusInternalServerError)
			return
		}

		// Issue tokens immediately so the user is logged in right after registering
		accessToken, err := GenerateAccessToken(user.UserID, user.Email)
		if err != nil {
			http.Error(w, "failed to generate token", http.StatusInternalServerError)
			return
		}
		refreshToken, err := GenerateRefreshToken(user.UserID, user.Email)
		if err != nil {
			http.Error(w, "failed to generate token", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(AuthResponse{
			AccessToken:  accessToken,
			RefreshToken: refreshToken,
			UserID:       user.UserID,
			Email:        user.Email,
			DisplayName:  user.DisplayName,
			Program:      user.Program,
			YearOfStudy:  user.YearOfStudy,
		})
	}
}

// LoginHandler handles POST /api/auth/login.
// Verifies credentials and returns a fresh token pair.
func LoginHandler(repo *Repository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req LoginRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}

		req.Email = strings.TrimSpace(strings.ToLower(req.Email))

		user, err := repo.GetUserByEmail(req.Email)
		if err != nil || user == nil {
			// Vague error intentionally — don't reveal whether the email exists
			http.Error(w, "invalid email or password", http.StatusUnauthorized)
			return
		}

		// Compare submitted password against stored bcrypt hash
		if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
			http.Error(w, "invalid email or password", http.StatusUnauthorized)
			return
		}

		accessToken, err := GenerateAccessToken(user.UserID, user.Email)
		if err != nil {
			http.Error(w, "failed to generate token", http.StatusInternalServerError)
			return
		}
		refreshToken, err := GenerateRefreshToken(user.UserID, user.Email)
		if err != nil {
			http.Error(w, "failed to generate token", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(AuthResponse{
			AccessToken:  accessToken,
			RefreshToken: refreshToken,
			UserID:       user.UserID,
			Email:        user.Email,
			DisplayName:  user.DisplayName,
			Program:      user.Program,
			YearOfStudy:  user.YearOfStudy,
		})
	}
}

// RefreshHandler handles POST /api/auth/refresh.
// Takes a valid refresh token and returns a new access token.
// No repo needed — this only parses and re-signs a token.
func RefreshHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req RefreshRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}

		claims, err := ParseToken(req.RefreshToken)
		if err != nil {
			http.Error(w, "invalid or expired refresh token", http.StatusUnauthorized)
			return
		}

		// Reject access tokens being used here — must be a refresh token
		if claims.TokenType != RefreshToken {
			http.Error(w, "refresh token required", http.StatusUnauthorized)
			return
		}

		// Issue a new short-lived access token
		newAccessToken, err := GenerateAccessToken(claims.UserID, claims.Email)
		if err != nil {
			http.Error(w, "failed to generate token", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"access_token": newAccessToken,
		})
	}
}
