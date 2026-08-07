ALTER TABLE lists ADD COLUMN public_signup_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE lists ADD COLUMN double_opt_in boolean NOT NULL DEFAULT true;
ALTER TABLE lists ADD COLUMN preference_center_visible boolean NOT NULL DEFAULT true;
ALTER TABLE lists ADD COLUMN consent_text_default text NOT NULL DEFAULT '';

CREATE TABLE public_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE,
  purpose text NOT NULL CHECK (purpose IN ('confirm', 'preferences', 'unsubscribe')),
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  subscription_id uuid REFERENCES subscriptions(id) ON DELETE CASCADE,
  list_id uuid REFERENCES lists(id) ON DELETE CASCADE,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX public_tokens_contact_purpose_idx ON public_tokens (contact_id, purpose, expires_at DESC);
CREATE INDEX public_tokens_subscription_purpose_idx ON public_tokens (subscription_id, purpose, expires_at DESC);

CREATE TABLE public_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  identity_hash text NOT NULL,
  ip_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX public_requests_identity_time_idx ON public_requests (identity_hash, created_at DESC);
CREATE INDEX public_requests_ip_time_idx ON public_requests (ip_hash, created_at DESC);
