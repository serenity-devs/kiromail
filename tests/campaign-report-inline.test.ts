import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const app = readFileSync("components/mail-app.tsx", "utf8");

test("campaign reports render inline from campaigns and aggregate reports", () => {
  assert.doesNotMatch(app, /CampaignReportModal/);
  assert.match(app, /backLabel="Volver a campañas"/);
  assert.match(app, /backLabel="Volver a informes"/);

  const reportView = app.slice(
    app.indexOf("function CampaignReportView"),
    app.indexOf("function TrendChart"),
  );
  assert.match(reportView, /<PageIntro/);
  assert.match(reportView, /campaign-report campaign-report-inline/);
  assert.doesNotMatch(reportView, /<Modal/);
});
