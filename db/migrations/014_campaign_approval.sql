ALTER TABLE campaigns ADD COLUMN approval_required boolean NOT NULL DEFAULT false;
ALTER TABLE campaigns ADD COLUMN approved_version integer;
ALTER TABLE campaigns ADD COLUMN approved_api_key_id uuid REFERENCES api_keys(id) ON DELETE SET NULL;

CREATE TABLE campaign_approval_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('request','approve','reject','comment','invalidated')),
  comment text NOT NULL DEFAULT '',
  campaign_version integer NOT NULL,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  api_key_id uuid REFERENCES api_keys(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX campaign_approval_comments_campaign_time_idx
  ON campaign_approval_comments(campaign_id,created_at DESC);
