ALTER TABLE suppressions ADD COLUMN status text NOT NULL DEFAULT 'active';
ALTER TABLE suppressions ADD CONSTRAINT suppressions_status_check CHECK (status IN ('active','resolved'));
ALTER TABLE suppressions ADD COLUMN resolved_at timestamptz;
ALTER TABLE suppressions ADD COLUMN resolved_by uuid REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE suppressions ADD COLUMN resolution_note text NOT NULL DEFAULT '';
CREATE INDEX suppressions_status_updated_idx ON suppressions (status,updated_at DESC);
