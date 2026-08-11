import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  defaultUiTheme,
  normalizeUiTheme,
  uiThemeIds,
  uiThemes,
} from "../lib/ui-themes";

const css = readFileSync("app/globals.css", "utf8");
const migration = readFileSync("db/migrations/025_ui_themes.sql", "utf8");
const settingsRoute = readFileSync("app/api/settings/route.ts", "utf8");
const settingsView = readFileSync("components/mail-app.tsx", "utf8");

test("the default plus four complete interface themes are available", () => {
  assert.equal(defaultUiTheme, "kiro");
  assert.equal(uiThemes.length, 5);
  assert.deepEqual(
    uiThemes.map((theme) => theme.id),
    [...uiThemeIds],
  );
  assert.equal(new Set(uiThemeIds).size, uiThemeIds.length);
  for (const theme of uiThemes) {
    assert.equal(theme.colors.length, 4);
    assert.ok(theme.headingFont);
    assert.ok(theme.bodyFont);
  }
});

test("unknown stored themes safely fall back to Kiro", () => {
  assert.equal(normalizeUiTheme("ocean"), "ocean");
  assert.equal(normalizeUiTheme("unknown"), "kiro");
  assert.equal(normalizeUiTheme(null), "kiro");
});

test("every alternative theme changes CSS colors and typography", () => {
  for (const id of uiThemeIds.slice(1)) {
    assert.match(css, new RegExp(`data-theme=["']${id}["']`));
  }
  assert.match(css, /--serif:/);
  assert.match(css, /--sans:/);
  assert.match(css, /--sidebar:/);
  assert.match(css, /--topbar-bg:/);
});

test("theme selection is persisted and exposed in the complete settings page", () => {
  assert.match(migration, /ADD COLUMN IF NOT EXISTS ui_theme/);
  for (const id of uiThemeIds) assert.match(migration, new RegExp(`'${id}'`));
  assert.match(settingsRoute, /ui_theme: z\.enum\(uiThemeIds\)/);
  assert.match(settingsRoute, /ui_theme=\$\{input\.ui_theme\}/);
  assert.match(settingsView, /label: "Apariencia"/);
  assert.match(settingsView, /role="radiogroup"/);
  assert.match(settingsView, /name="ui_theme"/);
});

test("operations panels have scoped responsive padding", () => {
  assert.match(css, /\.operations-grid>\.panel,\.dead-letter-panel,\.operations-runs \{ padding:22px 24px; \}/);
  assert.match(css, /\.operations-grid>\.panel,\.dead-letter-panel,\.operations-runs \{ padding:19px 18px; \}/);
});
