import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const app = readFileSync("components/mail-app.tsx", "utf8");

test("every application form reports blocked native validation", () => {
  const forms = app.match(/<form(?:\s|>)/g) ?? [];
  const invalidHandlers = app.match(/onInvalid=/g) ?? [];

  assert.ok(forms.length > 0);
  assert.equal(
    invalidHandlers.length,
    forms.length,
    "a submit blocked by browser validation must never look unresponsive",
  );
});

test("settings reveal and focus an invalid field from another tab", () => {
  assert.match(app, /function showInvalidField/);
  assert.match(app, /setActiveTab\(tabId\)/);
  assert.match(app, /control\.focus\(\)/);
  assert.match(app, /onInvalid=\{showInvalidField\}/);
  assert.match(app, /validationError \|\|/);
});

test("submit actions are explicit and entity creation recovers from errors", () => {
  assert.match(
    app,
    /type="submit"\s+className="button button-primary"\s+disabled=\{saving\}/,
  );
  const entityModal = app.slice(
    app.indexOf("function SimpleEntityModal"),
    app.indexOf("type SegmentPreview"),
  );
  assert.match(entityModal, /catch \(err\)/);
  assert.match(entityModal, /setError\(/);
  assert.match(entityModal, /setSaving\(false\)/);
});
