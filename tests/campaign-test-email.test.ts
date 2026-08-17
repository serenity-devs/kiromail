import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("an existing campaign test uses its pinned content snapshot", () => {
  const editor = readFileSync(new URL("../components/mail-app.tsx", import.meta.url), "utf8");
  const route = readFileSync(new URL("../app/api/test-email/route.ts", import.meta.url), "utf8");
  const service = readFileSync(new URL("../lib/campaign-service.ts", import.meta.url), "utf8");

  assert.match(editor, /campaign && !templateChanged[\s\S]*campaign_id: campaign\.id/);
  assert.match(route, /campaign_id: z\.string\(\)\.uuid\(\)\.optional\(\)/);
  assert.match(service, /SELECT c\.html_content,c\.text_content,'marketing' AS channel/);
  assert.match(service, /WHERE c\.id=\$\{campaignId\}/);
});
