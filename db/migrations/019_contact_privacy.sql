-- Contact deduplication and data-subject privacy operations.

ALTER TABLE contacts ADD COLUMN merged_into_contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL;
ALTER TABLE contacts ADD COLUMN merged_at timestamptz;
ALTER TABLE contacts ADD COLUMN anonymized_at timestamptz;
ALTER TABLE contacts ADD CONSTRAINT contacts_not_merged_into_self CHECK (merged_into_contact_id IS NULL OR merged_into_contact_id <> id);
CREATE INDEX contacts_live_created_idx ON contacts (created_at DESC) WHERE merged_into_contact_id IS NULL;
CREATE INDEX contacts_merged_into_idx ON contacts (merged_into_contact_id) WHERE merged_into_contact_id IS NOT NULL;

ALTER TABLE suppressions DROP CONSTRAINT suppressions_reason_check;
ALTER TABLE suppressions ADD CONSTRAINT suppressions_reason_check
  CHECK (reason IN ('unsubscribe', 'bounce', 'complaint', 'manual', 'privacy', 'merged'));

CREATE TABLE privacy_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('export', 'anonymize')),
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'completed', 'failed')),
  requested_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  requested_by_api_key_id uuid REFERENCES api_keys(id) ON DELETE SET NULL,
  reason text NOT NULL DEFAULT '',
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  requested_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX privacy_requests_contact_time_idx ON privacy_requests (contact_id, requested_at DESC);
CREATE INDEX privacy_requests_status_time_idx ON privacy_requests (status, requested_at DESC);

CREATE TABLE contact_merges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  survivor_contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  source_email_hash text NOT NULL,
  field_strategy text NOT NULL CHECK (field_strategy IN ('target', 'source', 'fill_empty')),
  reason text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  api_key_id uuid REFERENCES api_keys(id) ON DELETE SET NULL,
  merged_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX contact_merges_source_unique ON contact_merges (source_contact_id) WHERE source_contact_id IS NOT NULL;
CREATE INDEX contact_merges_survivor_time_idx ON contact_merges (survivor_contact_id, merged_at DESC);
