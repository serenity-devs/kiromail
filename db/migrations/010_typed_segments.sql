ALTER TABLE segments ADD COLUMN definition jsonb NOT NULL DEFAULT '{}'::jsonb;
UPDATE segments s SET definition=jsonb_build_object(
  'kind','group','match',s.match_type,'children',
  COALESCE((SELECT jsonb_agg(jsonb_build_object('kind','rule') || item) FROM jsonb_array_elements(s.rules) item),'[]'::jsonb)
) WHERE definition='{}'::jsonb;
ALTER TABLE segments ADD COLUMN last_count integer;
ALTER TABLE segments ADD COLUMN last_count_at timestamptz;

CREATE TABLE segment_count_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  segment_id uuid NOT NULL REFERENCES segments(id) ON DELETE CASCADE,
  captured_on date NOT NULL DEFAULT CURRENT_DATE,
  contact_count integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(segment_id,captured_on)
);
CREATE INDEX segment_count_history_segment_date_idx ON segment_count_history(segment_id,captured_on DESC);
