package pkg

import (
	"bytes"
	"crypto/rand"
	"crypto/tls"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"html"
	"log"
	"net"
	"net/http"
	"net/smtp"
	"os"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
)

// ─── Request / response shapes ───────────────────────────────────────────────

type ForgotPasswordRequest struct {
	Email string `json:"email"`
}

type ResetPasswordRequest struct {
	Token       string `json:"token"`
	NewPassword string `json:"new_password"`
}

// ─── Handlers ────────────────────────────────────────────────────────────────

// ForgotPasswordHandler handles POST /api/auth/forgot-password.
// Always responds 200 OK to prevent email enumeration.
// If the email is registered, a time-limited reset link is sent asynchronously.
func ForgotPasswordHandler(repo *Repository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req ForgotPasswordRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}

		req.Email = strings.TrimSpace(strings.ToLower(req.Email))
		if req.Email == "" {
			http.Error(w, "email is required", http.StatusBadRequest)
			return
		}

		// Respond immediately — never reveal whether the email exists.
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]string{
			"message": "If that email is registered you will receive a password reset link shortly.",
		})

		// Fire-and-forget: look up the user, generate token, send email.
		go func() {
			user, err := repo.GetUserByEmail(req.Email)
			if err != nil || user == nil {
				return // not registered — silent no-op
			}

			raw := make([]byte, 32)
			if _, err := rand.Read(raw); err != nil {
				log.Printf("[forgot-password] rand error: %v", err)
				return
			}
			token := hex.EncodeToString(raw)
			expiresAt := time.Now().Add(1 * time.Hour)

			if err := repo.CreatePasswordResetToken(user.UserID, token, expiresAt); err != nil {
				log.Printf("[forgot-password] store token error: %v", err)
				return
			}

			appURL := os.Getenv("APP_URL")
			if appURL == "" {
				appURL = "http://localhost:5173"
			}
			resetURL := fmt.Sprintf("%s/reset-password?token=%s", appURL, token)

			if err := sendPasswordResetEmail(user.Email, user.DisplayName, resetURL); err != nil {
				log.Printf("[forgot-password] email error: %v", err)
			} else {
				log.Printf("[forgot-password] reset email sent to %s", user.Email)
			}
		}()
	}
}

// ResetPasswordHandler handles POST /api/auth/reset-password.
// Validates the one-time token, enforces password rules, updates the hash.
func ResetPasswordHandler(repo *Repository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req ResetPasswordRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}

		req.Token = strings.TrimSpace(req.Token)
		if req.Token == "" {
			http.Error(w, "token is required", http.StatusBadRequest)
			return
		}
		if len(req.NewPassword) < 8 {
			http.Error(w, "password must be at least 8 characters", http.StatusBadRequest)
			return
		}

		userID, valid, err := repo.GetPasswordResetToken(req.Token)
		if err != nil {
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}
		if !valid {
			http.Error(w, "invalid or expired reset token", http.StatusBadRequest)
			return
		}

		hash, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), 12)
		if err != nil {
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}
		if err := repo.UpdateUserPassword(userID, string(hash)); err != nil {
			http.Error(w, "failed to update password", http.StatusInternalServerError)
			return
		}
		if err := repo.MarkPasswordResetTokenUsed(req.Token); err != nil {
			log.Printf("[reset-password] mark used error: %v", err) // non-fatal
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{
			"message": "Password updated successfully. You can now log in.",
		})
	}
}

// ─── Email ────────────────────────────────────────────────────────────────────

// sendPasswordResetEmail sends a branded password-reset email.
// If SMTP is not configured it logs the reset URL (dev-friendly fallback).
func sendPasswordResetEmail(toEmail, displayName, resetURL string) error {
	smtpHost := os.Getenv("SMTP_HOST")
	if smtpHost == "" {
		smtpHost = "smtp.gmail.com"
	}
	smtpPort := os.Getenv("SMTP_PORT")
	if smtpPort == "" {
		smtpPort = "587"
	}
	smtpUser := os.Getenv("SMTP_USER")
	smtpPass := os.Getenv("SMTP_PASSWORD")

	if smtpUser == "" || smtpPass == "" {
		log.Printf("[forgot-password] SMTP not configured — reset URL: %s", resetURL)
		return nil
	}

	from := smtpUser
	safeName := notEmpty(displayName, "there")
	safeEmail := html.EscapeString(toEmail)
	safeURL := html.EscapeString(resetURL)
	timestamp := time.Now().Format("Mon, Jan 2 2006 · 15:04 MST")

	plain := fmt.Sprintf(
		"Hi %s,\n\nWe received a request to reset the password for your MacTrack account (%s).\n\n"+
			"Use the link below to choose a new password (valid for 1 hour):\n\n%s\n\n"+
			"If you did not request this, ignore this email — your password will not change.\n\n"+
			"— The MacTrack Team\n",
		safeName, toEmail, resetURL,
	)

	htmlBody := fmt.Sprintf(`<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table width="100%%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%%">
        <tr><td style="background:#7A003C;border-radius:12px 12px 0 0;padding:24px 32px;text-align:center">
          <table cellpadding="0" cellspacing="0" style="margin:0 auto"><tr>
            <td style="background:#fff;border-radius:50%%;width:40px;height:40px;text-align:center;vertical-align:middle;font-weight:700;font-size:18px;color:#7A003C;line-height:40px">M</td>
            <td style="padding-left:12px;color:#fff;font-size:20px;font-weight:700;vertical-align:middle">MacTrack</td>
          </tr></table>
          <p style="margin:12px 0 0;color:rgba(255,255,255,0.75);font-size:13px">McMaster Course Explorer</p>
        </td></tr>
        <tr><td style="background:#5a0028;padding:12px 32px;border-bottom:3px solid #ffc845">
          <p style="margin:0;color:#ffc845;font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase">Password Reset Request</p>
        </td></tr>
        <tr><td style="background:#ffffff;padding:32px 32px 24px">
          <p style="margin:0 0 16px;font-size:16px;color:#111827">Hi <strong>%s</strong>,</p>
          <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6">We received a request to reset the password for the MacTrack account associated with <strong>%s</strong>.</p>
          <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.6">Click the button below to set a new password. This link expires in <strong>1 hour</strong>.</p>
          <table cellpadding="0" cellspacing="0" style="margin:0 auto 28px"><tr>
            <td style="background:#7A003C;border-radius:8px">
              <a href="%s" style="display:inline-block;padding:14px 32px;color:#fff;font-size:15px;font-weight:600;text-decoration:none;border-radius:8px">Reset Password</a>
            </td>
          </tr></table>
          <p style="margin:0 0 8px;font-size:13px;color:#6b7280">Or copy and paste this URL into your browser:</p>
          <p style="margin:0 0 24px;font-size:12px;color:#7A003C;word-break:break-all">%s</p>
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 20px">
          <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.5">If you did not request a password reset, you can safely ignore this email.</p>
        </td></tr>
        <tr><td style="background:#f9fafb;border-radius:0 0 12px 12px;padding:16px 32px;text-align:center;border-top:1px solid #e5e7eb">
          <p style="margin:0;font-size:12px;color:#9ca3af">Sent at %s &middot; MacTrack &middot; McMaster University</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`,
		html.EscapeString(safeName),
		safeEmail,
		safeURL,
		safeURL,
		html.EscapeString(timestamp),
	)

	boundary := fmt.Sprintf("MacTrackPwReset%d", time.Now().UnixNano())
	var buf bytes.Buffer
	fmt.Fprintf(&buf, "From: MacTrack <%s>\r\n", from)
	fmt.Fprintf(&buf, "To: %s\r\n", toEmail)
	fmt.Fprintf(&buf, "Subject: MacTrack — Reset Your Password\r\n")
	fmt.Fprintf(&buf, "MIME-Version: 1.0\r\n")
	fmt.Fprintf(&buf, "Content-Type: multipart/alternative; boundary=%q\r\n\r\n", boundary)
	fmt.Fprintf(&buf, "--%s\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n", boundary)
	buf.WriteString(plain)
	fmt.Fprintf(&buf, "\r\n--%s\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n", boundary)
	buf.WriteString(htmlBody)
	fmt.Fprintf(&buf, "\r\n--%s--\r\n", boundary)
	msg := buf.String()

	addr := net.JoinHostPort(smtpHost, smtpPort)
	auth := smtp.PlainAuth("", smtpUser, smtpPass, smtpHost)
	tlsCfg := &tls.Config{ServerName: smtpHost}

	if smtpPort == "465" {
		dialer := &net.Dialer{Timeout: smtpDialTimeout}
		rawConn, err := dialer.Dial("tcp", addr)
		if err != nil {
			return fmt.Errorf("tcp dial: %w", err)
		}
		rawConn.SetDeadline(time.Now().Add(smtpSessionTimeout))
		tlsConn := tls.Client(rawConn, tlsCfg)
		if err := tlsConn.Handshake(); err != nil {
			rawConn.Close()
			return fmt.Errorf("tls handshake: %w", err)
		}
		defer tlsConn.Close()
		return sendViaSMTPClient(tlsConn, smtpHost, auth, from, toEmail, msg)
	}

	// STARTTLS (port 587)
	dialer := &net.Dialer{Timeout: smtpDialTimeout}
	conn, err := dialer.Dial("tcp", addr)
	if err != nil {
		return fmt.Errorf("tcp dial: %w", err)
	}
	conn.SetDeadline(time.Now().Add(smtpSessionTimeout))
	defer conn.Close()

	client, err := smtp.NewClient(conn, smtpHost)
	if err != nil {
		return fmt.Errorf("smtp new client: %w", err)
	}
	defer client.Close()
	if ok, _ := client.Extension("STARTTLS"); ok {
		if err := client.StartTLS(tlsCfg); err != nil {
			return fmt.Errorf("smtp STARTTLS: %w", err)
		}
	}
	if err := client.Auth(auth); err != nil {
		return fmt.Errorf("smtp auth: %w", err)
	}
	return sendSMTPMessage(client, from, toEmail, msg)
}
