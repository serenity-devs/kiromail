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
  assert.match(reportView, /<CampaignTrendChart/);
  assert.doesNotMatch(reportView, /<Modal/);
});

test("campaign deliveries and clicks have separate scaled chart tabs", () => {
  const chart = app.slice(
    app.indexOf("function CampaignTrendChart"),
    app.indexOf("function TrendChart"),
  );
  assert.match(chart, /role="tablist"/);
  assert.match(chart, /setMetric\("deliveries"\)/);
  assert.match(chart, /setMetric\("clicks"\)/);
  assert.match(chart, /campaignChartScale\(config\.values\)/);
  assert.match(chart, /campaign-chart-y-axis/);
  assert.match(chart, /campaign-chart-x-axis/);
});
