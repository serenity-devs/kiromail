ALTER TABLE assets ADD COLUMN original_name text NOT NULL DEFAULT '';
ALTER TABLE assets ADD COLUMN sha256 text NOT NULL DEFAULT '';
ALTER TABLE assets ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX assets_active_created_idx ON assets (created_at DESC) WHERE archived_at IS NULL;
CREATE INDEX assets_sha256_idx ON assets (sha256) WHERE archived_at IS NULL;

ALTER TABLE template_versions ADD COLUMN change_note text NOT NULL DEFAULT '';
ALTER TABLE template_versions ADD COLUMN restored_from_version_id uuid REFERENCES template_versions(id) ON DELETE SET NULL;

CREATE TABLE asset_usages (
  asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
  template_version_id uuid NOT NULL REFERENCES template_versions(id) ON DELETE CASCADE,
  block_id text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (asset_id, template_version_id, block_id)
);
CREATE INDEX asset_usages_version_idx ON asset_usages (template_version_id);

CREATE TABLE reusable_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  folder text NOT NULL DEFAULT '',
  block_document jsonb NOT NULL,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);
CREATE INDEX reusable_blocks_active_updated_idx ON reusable_blocks (updated_at DESC) WHERE archived_at IS NULL;
