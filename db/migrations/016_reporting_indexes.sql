-- Reporting reads raw, immutable delivery and consent facts. These covering
-- indexes keep campaign, channel and audience reports responsive as history grows.

CREATE INDEX IF NOT EXISTS email_events_campaign_time_type_idx
  ON email_events (campaign_id, occurred_at, type)
  WHERE campaign_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS email_events_campaign_link_idx
  ON email_events (campaign_id, link_url, occurred_at)
  WHERE campaign_id IS NOT NULL AND link_url IS NOT NULL;

CREATE INDEX IF NOT EXISTS campaign_recipients_campaign_status_created_idx
  ON campaign_recipients (campaign_id, status, created_at);

CREATE INDEX IF NOT EXISTS consent_events_list_time_action_idx
  ON consent_events (list_id, occurred_at, action);

CREATE INDEX IF NOT EXISTS outbound_messages_kind_created_status_idx
  ON outbound_messages (kind, created_at, status);
