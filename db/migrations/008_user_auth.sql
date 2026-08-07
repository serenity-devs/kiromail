ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE users ADD COLUMN IF NOT EXISTS require_password_change boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS preferences jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS label text NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS user_sessions_token_active_idx ON user_sessions (token_hash, expires_at) WHERE revoked_at IS NULL;

CREATE TABLE auth_attempts (
  id bigserial PRIMARY KEY,
  email_hash text NOT NULL,
  ip inet,
  success boolean NOT NULL DEFAULT false,
  attempted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auth_attempts_email_time_idx ON auth_attempts (email_hash, attempted_at DESC);
CREATE INDEX auth_attempts_ip_time_idx ON auth_attempts (ip, attempted_at DESC) WHERE ip IS NOT NULL;

CREATE INDEX password_reset_tokens_active_idx ON password_reset_tokens (token_hash, expires_at) WHERE used_at IS NULL;
