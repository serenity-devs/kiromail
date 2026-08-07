CREATE TABLE transactional_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_scope text NOT NULL,
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  status text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing','completed','failed')),
  total_count integer NOT NULL,
  accepted_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  result jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  api_key_id uuid REFERENCES api_keys(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (idempotency_scope,idempotency_key)
);

ALTER TABLE outbound_messages ADD COLUMN batch_id uuid REFERENCES transactional_batches(id) ON DELETE SET NULL;
ALTER TABLE outbound_messages ADD COLUMN batch_position integer;
ALTER TABLE outbound_messages ADD COLUMN retry_of_message_id uuid REFERENCES outbound_messages(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX outbound_messages_batch_position_unique ON outbound_messages(batch_id,batch_position) WHERE batch_id IS NOT NULL;
CREATE INDEX outbound_messages_retry_idx ON outbound_messages(retry_of_message_id) WHERE retry_of_message_id IS NOT NULL;

ALTER TABLE message_attachments ALTER COLUMN blob_id DROP NOT NULL;
ALTER TABLE message_attachments ADD COLUMN asset_id uuid REFERENCES assets(id) ON DELETE RESTRICT;
ALTER TABLE message_attachments ADD CONSTRAINT message_attachments_source_check CHECK ((blob_id IS NOT NULL)::integer + (asset_id IS NOT NULL)::integer = 1);
CREATE INDEX message_attachments_asset_idx ON message_attachments(asset_id) WHERE asset_id IS NOT NULL;

CREATE TABLE message_send_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES outbound_messages(id) ON DELETE CASCADE,
  attempt_number integer NOT NULL,
  kind text NOT NULL DEFAULT 'automatic' CHECK (kind IN ('automatic','manual_retry')),
  status text NOT NULL DEFAULT 'started' CHECK (status IN ('started','succeeded','failed')),
  transport text NOT NULL DEFAULT '',
  provider_message_id text,
  error_code text,
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  UNIQUE (message_id,attempt_number)
);
CREATE INDEX message_send_attempts_message_time_idx ON message_send_attempts(message_id,started_at DESC);
