CREATE INDEX IF NOT EXISTS campaigns_list_started_report_idx
  ON campaigns (list_id, started_at, created_at)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS campaigns_segment_started_report_idx
  ON campaigns (target_id, started_at, created_at)
  WHERE target_type='segment' AND archived_at IS NULL;

CREATE INDEX IF NOT EXISTS email_events_interaction_message_idx
  ON email_events (message_id, occurred_at)
  WHERE type IN ('open','opened','click','clicked') AND NOT is_automated;
