import assert from "node:assert/strict";
import { existsSync,readFileSync } from "node:fs";
import test from "node:test";

test("HTML templates cannot be converted back into visual blocks",()=>{
  const editor=readFileSync(new URL("../components/template-editor.tsx",import.meta.url),"utf8");
  assert.match(editor,/function exportToHtml\(\)/);
  assert.match(editor,/disabled=\{mode==="html"\}/);
  assert.doesNotMatch(editor,/htmlToVisualDocument/);
  assert.equal(existsSync(new URL("../lib/html-to-visual.ts",import.meta.url)),false);
});
