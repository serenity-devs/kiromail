CREATE OR REPLACE FUNCTION enqueue_email_event_webhooks() RETURNS trigger AS $$
BEGIN
  INSERT INTO webhook_deliveries (endpoint_id,event_id,event_type,payload,next_attempt_at)
  SELECT w.id,NEW.id,NEW.type,
    jsonb_build_object(
      'event_id',NEW.id,
      'type',NEW.type,
      'occurred_at',NEW.occurred_at,
      'received_at',NEW.received_at,
      'message_id',NEW.message_id,
      'ses_message_id',NEW.ses_message_id,
      'link_url',NEW.link_url,
      'message',jsonb_build_object(
        'kind',m.kind,'status',m.status,'to_email',m.to_email,'subject',m.subject,
        'template_version_id',m.template_version_id,'campaign_id',m.campaign_id,'metadata',m.metadata
      ),
      'data',NEW.payload
    ),now()
  FROM webhook_endpoints w
  LEFT JOIN outbound_messages m ON m.id=NEW.message_id
  WHERE w.status='active'
    AND (cardinality(w.events)=0 OR NEW.type=ANY(w.events))
    AND (NOT (w.filters ? 'template_version_id') OR w.filters->>'template_version_id'=m.template_version_id::text)
    AND (NOT (w.filters ? 'metadata') OR m.metadata @> (w.filters->'metadata'));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER email_events_webhook_outbox
AFTER INSERT ON email_events
FOR EACH ROW EXECUTE FUNCTION enqueue_email_event_webhooks();
