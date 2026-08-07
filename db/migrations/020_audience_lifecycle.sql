-- Lifecycle provenance for duplicating lists and dynamic segments.

ALTER TABLE lists ADD COLUMN duplicated_from_id uuid REFERENCES lists(id) ON DELETE SET NULL;
ALTER TABLE segments ADD COLUMN duplicated_from_id uuid REFERENCES segments(id) ON DELETE SET NULL;
CREATE INDEX lists_duplicated_from_idx ON lists (duplicated_from_id) WHERE duplicated_from_id IS NOT NULL;
CREATE INDEX segments_duplicated_from_idx ON segments (duplicated_from_id) WHERE duplicated_from_id IS NOT NULL;
