-- Provenance for safe template duplication. Historical campaigns keep pointing
-- at their immutable versions; a copy always starts as a new draft.

ALTER TABLE templates ADD COLUMN duplicated_from_id uuid REFERENCES templates(id) ON DELETE SET NULL;
CREATE INDEX templates_duplicated_from_idx ON templates (duplicated_from_id) WHERE duplicated_from_id IS NOT NULL;
