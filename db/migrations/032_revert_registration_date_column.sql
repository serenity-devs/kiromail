-- Remove the mistakenly exposed KiroMail subscription date. ValueStats keeps
-- its actual registration date in the list field `registered_at` created via API.
UPDATE lists
SET subscriber_table_columns = array_remove(subscriber_table_columns, 'subscribed_at')
WHERE subscriber_table_columns @> ARRAY['subscribed_at']::text[];

ALTER TABLE lists
  ALTER COLUMN subscriber_table_columns SET DEFAULT
  ARRAY['phone', 'language', 'timezone', 'city', 'country']::text[];

ALTER TABLE lists
  DROP CONSTRAINT IF EXISTS lists_subscriber_table_columns_check;

ALTER TABLE lists
  ADD CONSTRAINT lists_subscriber_table_columns_check
  CHECK (
    subscriber_table_columns <@
    ARRAY['phone', 'language', 'timezone', 'city', 'country']::text[]
  );
