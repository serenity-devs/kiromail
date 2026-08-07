ALTER TABLE settings ADD COLUMN ses_tracking_source text NOT NULL DEFAULT 'local';
ALTER TABLE settings ADD CONSTRAINT settings_ses_tracking_source_check CHECK (ses_tracking_source IN ('local','ses'));
ALTER TABLE settings ADD COLUMN ses_suppression_sync_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE settings ADD COLUMN ses_suppression_sync_mode text NOT NULL DEFAULT 'import';
ALTER TABLE settings ADD CONSTRAINT settings_ses_suppression_sync_mode_check CHECK (ses_suppression_sync_mode IN ('import','bidirectional'));
ALTER TABLE settings ADD COLUMN bounce_alert_threshold numeric(7,6) NOT NULL DEFAULT 0.020000;
ALTER TABLE settings ADD COLUMN complaint_alert_threshold numeric(7,6) NOT NULL DEFAULT 0.001000;
ALTER TABLE settings ADD COLUMN delay_alert_threshold numeric(7,6) NOT NULL DEFAULT 0.050000;
ALTER TABLE settings ADD COLUMN allowed_sender_domains text[] NOT NULL DEFAULT '{}'::text[];
ALTER TABLE settings ADD COLUMN global_sending_paused boolean NOT NULL DEFAULT false;

CREATE TABLE ses_health_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transport text NOT NULL CHECK (transport IN ('smtp','ses')),
  region text NOT NULL,
  status text NOT NULL CHECK (status IN ('local','healthy','warning','error')),
  account jsonb NOT NULL DEFAULT '{}'::jsonb,
  identities jsonb NOT NULL DEFAULT '[]'::jsonb,
  configuration_sets jsonb NOT NULL DEFAULT '[]'::jsonb,
  checks jsonb NOT NULL DEFAULT '[]'::jsonb,
  error_code text,
  error_message text,
  checked_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ses_health_snapshots_checked_idx ON ses_health_snapshots (checked_at DESC);

CREATE TABLE suppression_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  region text NOT NULL,
  mode text NOT NULL CHECK (mode IN ('preview','import','bidirectional')),
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','failed')),
  ses_count integer NOT NULL DEFAULT 0,
  local_count integer NOT NULL DEFAULT 0,
  imported_count integer NOT NULL DEFAULT 0,
  exported_count integer NOT NULL DEFAULT 0,
  unchanged_count integer NOT NULL DEFAULT 0,
  error_message text,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX suppression_sync_runs_started_idx ON suppression_sync_runs (started_at DESC);

CREATE TABLE operational_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint text NOT NULL,
  type text NOT NULL,
  channel text NOT NULL DEFAULT 'all' CHECK (channel IN ('all','marketing','transactional')),
  severity text NOT NULL CHECK (severity IN ('info','warning','critical')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  title text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  detected_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE UNIQUE INDEX operational_alerts_open_fingerprint_unique ON operational_alerts (fingerprint) WHERE status='open';
CREATE INDEX operational_alerts_status_seen_idx ON operational_alerts (status,last_seen_at DESC);
