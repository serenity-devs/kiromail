ALTER TABLE campaigns ADD COLUMN version integer NOT NULL DEFAULT 1;
ALTER TABLE campaigns ADD COLUMN duplicated_from_id uuid REFERENCES campaigns(id) ON DELETE SET NULL;
ALTER TABLE campaigns ADD COLUMN paused_at timestamptz;
ALTER TABLE campaigns ADD COLUMN cancelled_at timestamptz;

CREATE TABLE campaign_transitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  action text NOT NULL,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  api_key_id uuid REFERENCES api_keys(id) ON DELETE SET NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX campaign_transitions_campaign_time_idx ON campaign_transitions(campaign_id,created_at DESC);
CREATE UNIQUE INDEX campaign_transitions_auto_complete_unique ON campaign_transitions(campaign_id,action) WHERE action='auto_complete';

ALTER TABLE campaign_recipients DROP CONSTRAINT campaign_recipients_status_check;
ALTER TABLE campaign_recipients ADD CONSTRAINT campaign_recipients_status_check
  CHECK (status IN ('pending','queued','processing','sent','delivered','bounced','complained','unsubscribed','failed'));
ALTER TABLE campaign_recipients ADD COLUMN processing_at timestamptz;
ALTER TABLE campaign_recipients ADD COLUMN attempt_count integer NOT NULL DEFAULT 0;
ALTER TABLE campaign_recipients ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX campaign_recipients_recovery_idx ON campaign_recipients(status,processing_at) WHERE status IN ('queued','processing');
