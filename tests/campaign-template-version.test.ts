import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const editor = readFileSync(
  new URL("../components/mail-app.tsx", import.meta.url),
  "utf8",
);
const data = readFileSync(new URL("../lib/data.ts", import.meta.url), "utf8");

test("campaign data includes its pinned template version number", () => {
  assert.match(
    data,
    /cv\.version_number AS template_version_number[\s\S]*cv\.id = c\.template_version_id/,
  );
});

test("campaign creation identifies the published template version", () => {
  assert.match(
    editor,
    /Versión publicada v\{item\.published_version_number \?\? "—"\}/,
  );
  assert.match(editor, /Se asociará la versión v/);
});

test("campaign editing can explicitly update a stale pinned version", () => {
  assert.match(
    editor,
    /campaign\.template_version_id !== selectedTemplate\.published_version_id/,
  );
  assert.match(editor, /function updateTemplateVersion\(\)/);
  assert.match(editor, /Actualizar a v\{selectedPublishedVersion \?\? "—"\}/);
  assert.match(
    editor,
    /selectedTemplate\?\.published_version_id && \(!campaign \|\| templateChanged\)/,
  );
});
