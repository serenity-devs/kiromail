ALTER TABLE campaigns ADD COLUMN launch_idempotency_scope text;
ALTER TABLE campaigns ADD COLUMN launch_idempotency_key text;
ALTER TABLE campaigns ADD COLUMN archived_at timestamptz;
CREATE UNIQUE INDEX campaigns_launch_idempotency_unique
  ON campaigns (launch_idempotency_scope, launch_idempotency_key)
  WHERE launch_idempotency_key IS NOT NULL;

CREATE TABLE campaign_exclusions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  subscription_id uuid REFERENCES subscriptions(id) ON DELETE SET NULL,
  email text NOT NULL,
  reason text NOT NULL CHECK (reason IN ('unsubscribed', 'pending', 'archived', 'contact_blocked', 'suppressed', 'segment', 'duplicate', 'invalid_email')),
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX campaign_exclusions_campaign_reason_idx ON campaign_exclusions (campaign_id, reason);
CREATE UNIQUE INDEX campaign_exclusions_campaign_subscription_reason_unique
  ON campaign_exclusions (campaign_id, subscription_id, reason)
  WHERE subscription_id IS NOT NULL;
