-- Normalize historical SES bounce payloads while preserving the original AWS
-- event. The canonical event type remains "bounced" for webhook compatibility.
UPDATE email_events
SET payload = jsonb_set(
  payload,
  '{normalized}',
  jsonb_strip_nulls(jsonb_build_object(
    'bounce_class', CASE lower(COALESCE(payload #>> '{bounce,bounceType}', 'undetermined'))
      WHEN 'permanent' THEN 'hard'
      WHEN 'transient' THEN 'soft'
      ELSE 'undetermined'
    END,
    'bounce_type', COALESCE(payload #>> '{bounce,bounceType}', 'Undetermined'),
    'bounce_subtype', COALESCE(payload #>> '{bounce,bounceSubType}', 'Undetermined'),
    'is_permanent', lower(COALESCE(payload #>> '{bounce,bounceType}', '')) = 'permanent',
    'should_suppress', lower(COALESCE(payload #>> '{bounce,bounceType}', '')) = 'permanent',
    'failure_code', CASE lower(COALESCE(payload #>> '{bounce,bounceType}', 'undetermined'))
      WHEN 'permanent' THEN 'hard_bounce'
      WHEN 'transient' THEN 'soft_bounce_final'
      ELSE 'undetermined_bounce'
    END,
    'failure_reason', concat_ws(' · ',
      CASE lower(COALESCE(payload #>> '{bounce,bounceType}', 'undetermined'))
        WHEN 'permanent' THEN 'Hard bounce de SES'
        WHEN 'transient' THEN 'Soft bounce final de SES'
        ELSE 'Rebote indeterminado de SES'
      END,
      concat(
        COALESCE(payload #>> '{bounce,bounceType}', 'Undetermined'),
        '/',
        COALESCE(payload #>> '{bounce,bounceSubType}', 'Undetermined')
      ),
      payload #>> '{bounce,bouncedRecipients,0,status}',
      payload #>> '{bounce,bouncedRecipients,0,action}',
      payload #>> '{bounce,bouncedRecipients,0,diagnosticCode}'
    ),
    'recipient', jsonb_strip_nulls(jsonb_build_object(
      'email_address', payload #>> '{bounce,bouncedRecipients,0,emailAddress}',
      'action', payload #>> '{bounce,bouncedRecipients,0,action}',
      'status', payload #>> '{bounce,bouncedRecipients,0,status}',
      'diagnostic_code', payload #>> '{bounce,bouncedRecipients,0,diagnosticCode}'
    ))
  )),
  true
)
WHERE source = 'ses'
  AND type = 'bounced'
  AND payload ? 'bounce';

WITH latest_bounce AS (
  SELECT DISTINCT ON (message_id)
    message_id,
    payload->'normalized'->>'failure_code' AS failure_code,
    payload->'normalized'->>'failure_reason' AS failure_reason
  FROM email_events
  WHERE source = 'ses'
    AND type = 'bounced'
    AND message_id IS NOT NULL
  ORDER BY message_id, occurred_at DESC, id DESC
)
UPDATE outbound_messages message
SET failure_code = latest_bounce.failure_code,
    failure_reason = latest_bounce.failure_reason,
    updated_at = now()
FROM latest_bounce
WHERE message.id = latest_bounce.message_id
  AND message.status = 'bounced';

WITH latest_bounce AS (
  SELECT DISTINCT ON (message_id)
    message_id,
    payload->'normalized'->>'failure_reason' AS failure_reason
  FROM email_events
  WHERE source = 'ses'
    AND type = 'bounced'
    AND message_id IS NOT NULL
  ORDER BY message_id, occurred_at DESC, id DESC
)
UPDATE campaign_recipients recipient
SET failure_reason = latest_bounce.failure_reason,
    updated_at = now()
FROM outbound_messages message
JOIN latest_bounce ON latest_bounce.message_id = message.id
WHERE recipient.id = message.campaign_recipient_id
  AND recipient.status = 'bounced';
