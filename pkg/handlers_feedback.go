package pkg

import (
	"bytes"
	"crypto/tls"
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
)

// FeedbackRequest is the JSON body expected by POST /api/feedback.
type FeedbackRequest struct {
	Message string `json:"message"`
	Email   string `json:"email,omitempty"`
	Page    string `json:"page,omitempty"`
}

// FeedbackHandler handles POST /api/feedback.
// It is intentionally public (no JWT required) so anonymous users can submit
// feedback. The email is sent asynchronously so the handler responds quickly.
func FeedbackHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		var req FeedbackRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}

		req.Message = strings.TrimSpace(req.Message)
		if req.Message == "" {
			http.Error(w, "message is required", http.StatusBadRequest)
			return
		}
		if len(req.Message) > 2000 {
			http.Error(w, "message too long (max 2000 chars)", http.StatusBadRequest)
			return
		}

		// Send the email synchronously. Background goroutines started from a
		// Lambda handler may be frozen or not run to completion when the
		// invocation finishes, so fire-and-forget is unsafe for delivery.
		if err := sendFeedbackEmail(req); err != nil {
			log.Printf("[feedback] email send error: %v", err)
		} else {
			log.Printf("[feedback] email sent (from=%q page=%q len=%d)",
				req.Email, req.Page, len(req.Message))
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusAccepted)
		_ = json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
	}
}

const (
	smtpDialTimeout    = 15 * time.Second
	smtpSessionTimeout = 30 * time.Second
)

// sendFeedbackEmail dials the configured SMTP server and sends the feedback
// email. Supports both STARTTLS (port 587, default) and implicit TLS (port 465).
// All network operations are bounded by explicit timeouts so the goroutine
// never hangs indefinitely.
//
// Required env vars:
//
//	SMTP_USER       – Gmail address used as the sender / auth username
//	SMTP_PASSWORD   – Gmail app password (16-char, no spaces)
//	FEEDBACK_TO     – Address that receives the feedback emails
//
// Optional env vars:
//
//	SMTP_HOST       – defaults to smtp.gmail.com
//	SMTP_PORT       – defaults to 587
func sendFeedbackEmail(req FeedbackRequest) error {
	host := os.Getenv("SMTP_HOST")
	if host == "" {
		host = "smtp.gmail.com"
	}
	port := os.Getenv("SMTP_PORT")
	if port == "" {
		port = "587"
	}
	user := os.Getenv("SMTP_USER")
	pass := os.Getenv("SMTP_PASSWORD")
	to := os.Getenv("FEEDBACK_TO")

	if user == "" || pass == "" || to == "" {
		return fmt.Errorf("SMTP_USER, SMTP_PASSWORD, and FEEDBACK_TO must all be set")
	}

	from := user
	senderEmail := notEmpty(req.Email, "anonymous")
	pageLabel := notEmpty(req.Page, "unknown")
	timestamp := time.Now().Format("Mon, Jan 2 2006 · 15:04 MST")
	subject := fmt.Sprintf("MacTrack Feedback — %s", time.Now().Format("Jan 2, 2006 15:04 MST"))

	// ── Plain-text fallback ───────────────────────────────────────────────────
	plain := fmt.Sprintf(
		"New feedback submitted via MacTrack\n"+
			"====================================\n\n"+
			"Submitted at : %s\n"+
			"User email   : %s\n"+
			"Page         : %s\n\n"+
			"--- Feedback ---\n\n%s\n",
		timestamp, senderEmail, pageLabel, req.Message,
	)

	// ── HTML body ────────────────────────────────────────────────────────────
	replyRow := ""
	if req.Email != "" {
		replyRow = fmt.Sprintf(`
        <tr>
          <td style="padding:6px 0;color:#6b7280;font-size:13px;width:110px;vertical-align:top">Reply-to</td>
          <td style="padding:6px 0;font-size:13px;color:#111827">
            <a href="mailto:%s" style="color:#7A003C;text-decoration:none">%s</a>
          </td>
        </tr>`, html.EscapeString(req.Email), html.EscapeString(req.Email))
	}

	htmlBody := fmt.Sprintf(`<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table width="100%%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%%">

        <!-- Header -->
        <tr>
          <td style="background:#7A003C;border-radius:12px 12px 0 0;padding:24px 32px;text-align:center">
            <table cellpadding="0" cellspacing="0" style="margin:0 auto">
              <tr>
                <td style="background:#fff;border-radius:50%%;width:40px;height:40px;text-align:center;vertical-align:middle;font-weight:700;font-size:18px;color:#7A003C;line-height:40px">M</td>
                <td style="padding-left:12px;color:#fff;font-size:20px;font-weight:700;vertical-align:middle">MacTrack</td>
              </tr>
            </table>
            <p style="margin:12px 0 0;color:rgba(255,255,255,0.75);font-size:13px">McMaster Course Explorer</p>
          </td>
        </tr>

        <!-- Title bar -->
        <tr>
          <td style="background:#5a0028;padding:12px 32px;border-bottom:3px solid #ffc845">
            <p style="margin:0;color:#ffc845;font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase">New Feedback Received</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="background:#ffffff;padding:28px 32px 24px">

            <!-- Meta table -->
            <table cellpadding="0" cellspacing="0" style="width:100%%;margin-bottom:24px;border-collapse:collapse">
              <tr>
                <td style="padding:6px 0;color:#6b7280;font-size:13px;width:110px;vertical-align:top">Submitted at</td>
                <td style="padding:6px 0;font-size:13px;color:#111827">%s</td>
              </tr>
              <tr>
                <td style="padding:6px 0;color:#6b7280;font-size:13px;vertical-align:top">Page</td>
                <td style="padding:6px 0;font-size:13px;color:#111827;font-family:monospace">%s</td>
              </tr>
              %s
            </table>

            <!-- Divider -->
            <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 20px">

            <!-- Message -->
            <p style="margin:0 0 8px;font-size:12px;font-weight:600;color:#6b7280;letter-spacing:0.06em;text-transform:uppercase">Message</p>
            <div style="background:#f9fafb;border-left:4px solid #7A003C;border-radius:0 8px 8px 0;padding:16px 20px;font-size:15px;line-height:1.65;color:#1f2937;white-space:pre-wrap">%s</div>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f9fafb;border-radius:0 0 12px 12px;padding:16px 32px;text-align:center;border-top:1px solid #e5e7eb">
            <p style="margin:0;font-size:12px;color:#9ca3af">This email was sent automatically by MacTrack &middot; McMaster University</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`,
		html.EscapeString(timestamp),
		html.EscapeString(pageLabel),
		replyRow,
		html.EscapeString(req.Message),
	)

	// ── Build multipart/alternative MIME message ─────────────────────────────
	boundary := fmt.Sprintf("MacTrackBoundary%d", time.Now().UnixNano())
	var buf bytes.Buffer
	fmt.Fprintf(&buf, "From: MacTrack <%s>\r\n", from)
	fmt.Fprintf(&buf, "To: %s\r\n", to)
	if req.Email != "" {
		fmt.Fprintf(&buf, "Reply-To: %s\r\n", req.Email)
	}
	fmt.Fprintf(&buf, "Subject: %s\r\n", subject)
	fmt.Fprintf(&buf, "MIME-Version: 1.0\r\n")
	fmt.Fprintf(&buf, "Content-Type: multipart/alternative; boundary=%q\r\n", boundary)
	fmt.Fprintf(&buf, "\r\n")

	// Plain-text part
	fmt.Fprintf(&buf, "--%s\r\n", boundary)
	fmt.Fprintf(&buf, "Content-Type: text/plain; charset=UTF-8\r\n\r\n")
	buf.WriteString(plain)
	fmt.Fprintf(&buf, "\r\n")

	// HTML part
	fmt.Fprintf(&buf, "--%s\r\n", boundary)
	fmt.Fprintf(&buf, "Content-Type: text/html; charset=UTF-8\r\n\r\n")
	buf.WriteString(htmlBody)
	fmt.Fprintf(&buf, "\r\n")

	// Closing boundary
	fmt.Fprintf(&buf, "--%s--\r\n", boundary)

	msg := buf.String()

	addr := net.JoinHostPort(host, port)
	auth := smtp.PlainAuth("", user, pass, host)
	tlsCfg := &tls.Config{ServerName: host}

	if port == "465" {
		// Implicit TLS — wrap a plain TCP conn (with dial timeout) in TLS.
		dialer := &net.Dialer{Timeout: smtpDialTimeout}
		rawConn, err := dialer.Dial("tcp", addr)
		if err != nil {
			return fmt.Errorf("tcp dial %s: %w", addr, err)
		}
		rawConn.SetDeadline(time.Now().Add(smtpSessionTimeout))
		tlsConn := tls.Client(rawConn, tlsCfg)
		if err := tlsConn.Handshake(); err != nil {
			rawConn.Close()
			return fmt.Errorf("tls handshake: %w", err)
		}
		defer tlsConn.Close()
		return sendViaSMTPClient(tlsConn, host, auth, from, to, msg)
	}

	// STARTTLS (port 587) — open plain TCP, then upgrade inside the SMTP session.
	dialer := &net.Dialer{Timeout: smtpDialTimeout}
	conn, err := dialer.Dial("tcp", addr)
	if err != nil {
		return fmt.Errorf("tcp dial %s: %w", addr, err)
	}
	conn.SetDeadline(time.Now().Add(smtpSessionTimeout))
	defer conn.Close()

	client, err := smtp.NewClient(conn, host)
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
	return sendSMTPMessage(client, from, to, msg)
}

// sendViaSMTPClient creates a new smtp.Client over an already-connected net.Conn
// (used for the port-465 / implicit-TLS path).
func sendViaSMTPClient(conn net.Conn, host string, auth smtp.Auth, from, to, msg string) error {
	client, err := smtp.NewClient(conn, host)
	if err != nil {
		return fmt.Errorf("smtp new client: %w", err)
	}
	defer client.Close()
	if err := client.Auth(auth); err != nil {
		return fmt.Errorf("smtp auth: %w", err)
	}
	return sendSMTPMessage(client, from, to, msg)
}

// sendSMTPMessage issues MAIL FROM / RCPT TO / DATA on an authenticated client.
func sendSMTPMessage(client *smtp.Client, from, to, msg string) error {
	if err := client.Mail(from); err != nil {
		return fmt.Errorf("smtp MAIL FROM: %w", err)
	}
	if err := client.Rcpt(to); err != nil {
		return fmt.Errorf("smtp RCPT TO: %w", err)
	}
	wc, err := client.Data()
	if err != nil {
		return fmt.Errorf("smtp DATA: %w", err)
	}
	if _, err = fmt.Fprint(wc, msg); err != nil {
		return fmt.Errorf("smtp write body: %w", err)
	}
	return wc.Close()
}

// notEmpty returns s if non-empty, otherwise falls back to def.
func notEmpty(s, def string) string {
	if s != "" {
		return s
	}
	return def
}
