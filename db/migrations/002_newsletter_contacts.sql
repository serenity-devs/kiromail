UPDATE segments s
SET rules = COALESCE((
  SELECT jsonb_agg(rule)
  FROM jsonb_array_elements(s.rules) AS rule
  WHERE rule->>'field' <> 'company'
), '[]'::jsonb),
updated_at = now()
WHERE EXISTS (
  SELECT 1 FROM jsonb_array_elements(s.rules) AS rule WHERE rule->>'field' = 'company'
);

ALTER TABLE contacts DROP COLUMN IF EXISTS company;
