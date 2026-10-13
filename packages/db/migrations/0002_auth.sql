-- 0002: authentication hardening (lockout, TOTP replay protection, recovery codes)
ALTER TABLE users
  ADD COLUMN failed_login_count integer NOT NULL DEFAULT 0,
  ADD COLUMN locked_until       timestamptz,
  ADD COLUMN totp_last_step     bigint,
  ADD COLUMN password_changed_at timestamptz NOT NULL DEFAULT now();

CREATE TABLE recovery_codes (
  id         bigserial PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash  text NOT NULL,
  used_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX recovery_codes_user_idx ON recovery_codes (user_id);

-- sessions.id now stores sha256(token); the raw token only lives in the cookie
CREATE INDEX sessions_expires_idx ON sessions (expires_at);
