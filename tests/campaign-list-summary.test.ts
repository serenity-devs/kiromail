import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const app = readFileSync(
  new URL("../components/mail-app.tsx", import.meta.url),
  "utf8",
);
const data = readFileSync(new URL("../lib/data.ts", import.meta.url), "utf8");

test("campaign rows summarize audience, targeting and delivered performance", () => {
  const row = app.slice(
    app.indexOf("function CampaignRow"),
    app.indexOf("function ContactsView"),
  );
  assert.match(row, /campaignAudienceSummary\(campaign, data\)/);
  assert.match(row, /suscriptores ahora/);
  assert.match(row, /Segmento/);
  assert.match(row, /aperturas · \$\{clickRate\}% clics/);
});

test("campaign segment summaries use list-scoped subscriber counts", () => {
  assert.match(data, /buildSegmentFilter\(definition, segment\.match_type,segment\.list_id\?2:1\)/);
  assert.match(data, /base\.list_id::text=\$1::text/);
  assert.ok(
    data.indexOf("WHEN c.target_type = 'segment'") <
      data.indexOf("WHEN c.list_id IS NOT NULL"),
  );
});
