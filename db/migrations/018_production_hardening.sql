-- Production hardening: MFA recovery, worker liveness, maintenance/backup history
-- and configurable privacy retention. All changes are additive.

ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_recovery_codes jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_enabled_at timestamptz;

ALTER TABLE settings ADD COLUMN IF NOT EXISTS event_retention_days integer NOT NULL DEFAULT 730;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS audit_retention_days integer NOT NULL DEFAULT 1095;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS import_retention_days integer NOT NULL DEFAULT 30;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS personal_data_retention_days integer NOT NULL DEFAULT 90;
ALTER TABLE settings ADD CONSTRAINT settings_event_retention_days_check CHECK (event_retention_days BETWEEN 30 AND 3650);
ALTER TABLE settings ADD CONSTRAINT settings_audit_retention_days_check CHECK (audit_retention_days BETWEEN 90 AND 3650);
ALTER TABLE settings ADD CONSTRAINT settings_import_retention_days_check CHECK (import_retention_days BETWEEN 1 AND 365);
ALTER TABLE settings ADD CONSTRAINT settings_personal_retention_days_check CHECK (personal_data_retention_days BETWEEN 1 AND 730);

CREATE TABLE worker_heartbeats (
  service text NOT NULL,
  instance_id text NOT NULL,
  queues jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  heartbeat_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (service, instance_id)
);
CREATE INDEX worker_heartbeats_recent_idx ON worker_heartbeats (heartbeat_at DESC);

CREATE TABLE operational_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('backup','restore_test','retention','blob_reconciliation','diagnostic')),
  status text NOT NULL CHECK (status IN ('running','completed','failed')),
  instance_id text NOT NULL DEFAULT '',
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX operational_runs_type_time_idx ON operational_runs (type, started_at DESC);

CREATE TABLE dead_letter_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_name text NOT NULL,
  job_id text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  error text NOT NULL DEFAULT '',
  attempts integer NOT NULL DEFAULT 0,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','retried','resolved')),
  failed_at timestamptz NOT NULL DEFAULT now(),
  retried_at timestamptz,
  resolved_at timestamptz,
  UNIQUE (queue_name, job_id)
);
CREATE INDEX dead_letter_items_status_time_idx ON dead_letter_items (status, failed_at DESC);

CREATE TABLE request_metric_minutes (
  minute timestamptz NOT NULL,
  method text NOT NULL,
  route_group text NOT NULL,
  status_class smallint NOT NULL CHECK (status_class BETWEEN 0 AND 5),
  requests bigint NOT NULL DEFAULT 0,
  total_duration_ms bigint NOT NULL DEFAULT 0,
  max_duration_ms integer NOT NULL DEFAULT 0,
  PRIMARY KEY (minute, method, route_group, status_class)
);
CREATE INDEX request_metric_minutes_time_idx ON request_metric_minutes (minute DESC);
