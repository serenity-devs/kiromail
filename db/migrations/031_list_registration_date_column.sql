-- The registration date is maintained automatically by the subscription and
-- can be shown and ordered like the other per-list subscriber table columns.
ALTER TABLE lists
  DROP CONSTRAINT IF EXISTS lists_subscriber_table_columns_check;

ALTER TABLE lists
  ALTER COLUMN subscriber_table_columns SET DEFAULT
  ARRAY['phone', 'language', 'timezone', 'city', 'country', 'subscribed_at']::text[];

UPDATE lists
SET subscriber_table_columns = array_append(subscriber_table_columns, 'subscribed_at')
WHERE NOT subscriber_table_columns @> ARRAY['subscribed_at']::text[];

ALTER TABLE lists
  ADD CONSTRAINT lists_subscriber_table_columns_check
  CHECK (
    subscriber_table_columns <@
    ARRAY['phone', 'language', 'timezone', 'city', 'country', 'subscribed_at']::text[]
  );
