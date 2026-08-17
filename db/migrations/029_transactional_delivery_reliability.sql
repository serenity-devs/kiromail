-- SES API acceptance and its later SEND notification used to be displayed as
-- two identical "sent" events. Preserve both facts with distinct semantics.
UPDATE email_events
SET type = 'provider_accepted'
WHERE type = 'sent'
  AND source = 'ses'
  AND payload->>'transport' = 'ses';

-- Older webhook handling stored SES SEND but did not use it to repair a local
-- state update interrupted after provider acceptance. Reconcile those rows now.
WITH latest_send AS (
  SELECT DISTINCT ON (message_id)
    message_id,
    ses_message_id,
    occurred_at
  FROM email_events
  WHERE type = 'sent'
    AND source = 'ses'
    AND message_id IS NOT NULL
  ORDER BY message_id, occurred_at DESC, id DESC
)
UPDATE outbound_messages message
SET status = CASE
      WHEN message.status IN ('accepted', 'queued', 'processing')
        OR (message.status = 'failed' AND message.failure_code IN ('worker_error', 'transport_error', 'provider_acceptance_unconfirmed'))
      THEN 'sent'
      ELSE message.status
    END,
    ses_message_id = COALESCE(message.ses_message_id, latest_send.ses_message_id),
    sent_at = COALESCE(message.sent_at, latest_send.occurred_at),
    failure_code = CASE WHEN message.status IN ('accepted', 'queued', 'processing') OR (message.status = 'failed' AND message.failure_code IN ('worker_error', 'transport_error', 'provider_acceptance_unconfirmed')) THEN NULL ELSE message.failure_code END,
    failure_reason = CASE WHEN message.status IN ('accepted', 'queued', 'processing') OR (message.status = 'failed' AND message.failure_code IN ('worker_error', 'transport_error', 'provider_acceptance_unconfirmed')) THEN NULL ELSE message.failure_reason END,
    updated_at = now()
FROM latest_send
WHERE message.id = latest_send.message_id;

WITH latest_send AS (
  SELECT DISTINCT ON (message_id)
    message_id,
    ses_message_id,
    occurred_at
  FROM email_events
  WHERE type = 'sent'
    AND source = 'ses'
    AND message_id IS NOT NULL
  ORDER BY message_id, occurred_at DESC, id DESC
), latest_attempt AS (
  SELECT DISTINCT ON (attempt.message_id)
    attempt.id,
    latest_send.ses_message_id,
    latest_send.occurred_at
  FROM message_send_attempts attempt
  JOIN latest_send ON latest_send.message_id = attempt.message_id
  WHERE attempt.status = 'started'
  ORDER BY attempt.message_id, attempt.attempt_number DESC
)
UPDATE message_send_attempts attempt
SET status = 'succeeded',
    provider_message_id = COALESCE(attempt.provider_message_id, latest_attempt.ses_message_id),
    finished_at = COALESCE(attempt.finished_at, latest_attempt.occurred_at)
FROM latest_attempt
WHERE attempt.id = latest_attempt.id;

WITH latest_send AS (
  SELECT DISTINCT ON (message_id)
    message_id,
    ses_message_id,
    occurred_at
  FROM email_events
  WHERE type = 'sent'
    AND source = 'ses'
    AND message_id IS NOT NULL
  ORDER BY message_id, occurred_at DESC, id DESC
)
UPDATE campaign_recipients recipient
SET status = CASE WHEN recipient.status IN ('pending', 'queued', 'processing') THEN 'sent' ELSE recipient.status END,
    ses_message_id = COALESCE(recipient.ses_message_id, latest_send.ses_message_id),
    sent_at = COALESCE(recipient.sent_at, latest_send.occurred_at),
    processing_at = NULL,
    updated_at = now()
FROM outbound_messages message
JOIN latest_send ON latest_send.message_id = message.id
WHERE recipient.id = message.campaign_recipient_id;

-- A worker restart will enqueue these rows again. Returning stale claims to
-- queued prevents old processing rows from remaining invisible indefinitely.
UPDATE message_send_attempts attempt
SET status = 'failed',
    error_code = 'worker_interrupted',
    error_message = 'El worker se interrumpió antes de confirmar el resultado',
    finished_at = COALESCE(finished_at, now())
FROM outbound_messages message
WHERE attempt.message_id = message.id
  AND attempt.status = 'started'
  AND message.kind = 'transactional'
  AND message.status = 'processing'
  AND message.ses_message_id IS NULL
  AND message.updated_at < now() - interval '5 minutes';

UPDATE outbound_messages
SET status = 'queued',
    failure_code = 'worker_interrupted',
    failure_reason = 'Recuperado después de una interrupción del worker',
    updated_at = now()
WHERE kind = 'transactional'
  AND status = 'processing'
  AND ses_message_id IS NULL
  AND updated_at < now() - interval '5 minutes';
