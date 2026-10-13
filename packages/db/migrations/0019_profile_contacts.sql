-- 0019: profile. Personal contact methods (verified before use; targets encrypted, as a Teams
-- workflow URL is a secret), personal notification steps, and a pending 2FA secret while a user
-- moves to a new phone (the old one keeps working until the new one is confirmed).
ALTER TABLE users
  ADD COLUMN pending_totp_secret_enc text,
  ADD COLUMN notification_steps jsonb NOT NULL DEFAULT '[]';

CREATE TABLE user_contact_methods (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type            text NOT NULL CHECK (type IN ('email', 'teams', 'telegram')),
  label           text NOT NULL DEFAULT '',
  target_enc      text NOT NULL,
  verified_at     timestamptz,
  code_hash       text,
  code_expires_at timestamptz,
  code_attempts   int NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX user_contact_methods_user ON user_contact_methods (user_id);
