-- Global contact attributes can be shown or hidden independently for each list.
ALTER TABLE lists
  ADD COLUMN IF NOT EXISTS subscriber_table_columns text[] NOT NULL
  DEFAULT ARRAY['phone', 'language', 'timezone', 'city', 'country']::text[];

ALTER TABLE lists
  DROP CONSTRAINT IF EXISTS lists_subscriber_table_columns_check;

ALTER TABLE lists
  ADD CONSTRAINT lists_subscriber_table_columns_check
  CHECK (
    subscriber_table_columns <@
    ARRAY['phone', 'language', 'timezone', 'city', 'country']::text[]
  );
