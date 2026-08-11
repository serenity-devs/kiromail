-- The interface theme is shared by the workspace and applied to every signed-in user.
ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS ui_theme text NOT NULL DEFAULT 'kiro'
  CHECK (ui_theme IN ('kiro', 'ocean', 'lavender', 'terracotta', 'graphite'));
