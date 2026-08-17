ALTER TABLE campaigns DROP CONSTRAINT IF EXISTS campaigns_target_type_check;
ALTER TABLE campaigns ADD CONSTRAINT campaigns_target_type_check
  CHECK (target_type IN ('all', 'list', 'tag', 'segment', 'non_openers'));

CREATE INDEX campaigns_non_opener_source_idx
  ON campaigns (target_id)
  WHERE target_type = 'non_openers' AND archived_at IS NULL;
