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

test("segment editor loads and exposes every active field from the selected list", () => {
  const segmentEditor = app.slice(
    app.indexOf("function SegmentModal"),
    app.indexOf("function CampaignModal"),
  );
  assert.match(segmentEditor, /\/api\/v1\/lists\/\$\{listId\}\/fields/);
  assert.match(segmentEditor, /result\.data[\s\S]*field\.status === "active"/);
  assert.match(segmentEditor, /label="Campos propios de la lista"/);
  assert.match(segmentEditor, /segmentListFieldPrefix/);
  assert.doesNotMatch(segmentEditor, /aria-label="Campo propio"/);
});

test("segment date ranges explain that both dates are included", () => {
  const segmentEditor = app.slice(
    app.indexOf("function SegmentModal"),
    app.indexOf("function CampaignModal"),
  );
  assert.match(segmentEditor, /Ambas fechas están incluidas\./);
  assert.match(segmentEditor, /Fecha inicial incluida/);
  assert.match(segmentEditor, /Fecha final incluida/);
});
