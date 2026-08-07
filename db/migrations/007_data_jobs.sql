ALTER TABLE background_jobs ADD COLUMN storage_key text;
ALTER TABLE background_jobs ADD COLUMN original_filename text NOT NULL DEFAULT '';
ALTER TABLE background_jobs ADD COLUMN result_storage_key text;
ALTER TABLE background_jobs ADD COLUMN errors_storage_key text;
ALTER TABLE background_jobs ADD COLUMN total_rows integer NOT NULL DEFAULT 0;
ALTER TABLE background_jobs ADD COLUMN processed_rows integer NOT NULL DEFAULT 0;
ALTER TABLE background_jobs ADD COLUMN cancel_requested boolean NOT NULL DEFAULT false;
ALTER TABLE background_jobs ADD COLUMN rollback_at timestamptz;
ALTER TABLE background_jobs ADD COLUMN idempotency_scope text;
ALTER TABLE background_jobs ADD COLUMN idempotency_key text;
ALTER TABLE background_jobs ADD COLUMN request_hash text;
CREATE UNIQUE INDEX background_jobs_idempotency_idx ON background_jobs(idempotency_scope,idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX background_jobs_type_created_idx ON background_jobs(type,created_at DESC);

CREATE TABLE background_job_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES background_jobs(id) ON DELETE CASCADE,
  row_number integer NOT NULL,
  contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  subscription_id uuid REFERENCES subscriptions(id) ON DELETE SET NULL,
  contact_created boolean NOT NULL DEFAULT false,
  subscription_created boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX background_job_changes_job_idx ON background_job_changes(job_id,row_number);

CREATE TABLE import_rejections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES background_jobs(id) ON DELETE CASCADE,
  row_number integer NOT NULL,
  email text NOT NULL DEFAULT '',
  reason text NOT NULL,
  row_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX import_rejections_job_idx ON import_rejections(job_id,row_number);
