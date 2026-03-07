-- 013_password_reset_tokens.sql
-- Stores one-time tokens for the forgot-password flow.
-- Works for both SQLite and PostgreSQL.

CREATE TABLE IF NOT EXISTS password_reset_tokens (
    token       TEXT        NOT NULL PRIMARY KEY,
    user_id     INTEGER     NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    expires_at  TIMESTAMP   NOT NULL,
    used_at     TIMESTAMP   -- NULL until the token is consumed
);
