-- Extend the workspace theme constraint without changing the current selection.
ALTER TABLE settings
  DROP CONSTRAINT IF EXISTS settings_ui_theme_check;

ALTER TABLE settings
  ADD CONSTRAINT settings_ui_theme_check
  CHECK (ui_theme IN ('kiro', 'ocean', 'lavender', 'terracotta', 'graphite', 'terminal'));
