-- Monotonic revisions back strong HTTP validators for mutable API resources.
-- A trigger keeps revisions correct for UI, API, workers and maintenance SQL alike.
CREATE OR REPLACE FUNCTION bump_resource_revision()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.revision = OLD.revision THEN
    NEW.revision := OLD.revision + 1;
  END IF;
  RETURN NEW;
END;
$$;

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0);
ALTER TABLE lists ADD COLUMN IF NOT EXISTS revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0);
ALTER TABLE list_fields ADD COLUMN IF NOT EXISTS revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0);
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0);
ALTER TABLE segments ADD COLUMN IF NOT EXISTS revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0);
ALTER TABLE templates ADD COLUMN IF NOT EXISTS revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0);
ALTER TABLE assets ADD COLUMN IF NOT EXISTS revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0);
ALTER TABLE reusable_blocks ADD COLUMN IF NOT EXISTS revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0);
ALTER TABLE webhook_endpoints ADD COLUMN IF NOT EXISTS revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0);
ALTER TABLE suppressions ADD COLUMN IF NOT EXISTS revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0);

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'contacts','lists','list_fields','subscriptions','segments','templates',
    'assets','reusable_blocks','webhook_endpoints','suppressions'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', 'bump_' || table_name || '_revision', table_name);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION bump_resource_revision()',
      'bump_' || table_name || '_revision', table_name
    );
  END LOOP;
END;
$$;
