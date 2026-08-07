import assert from "node:assert/strict";
import test from "node:test";
import { buildTrackedHtml, personalize } from "../lib/email";

test("personalize replaces known values and clears unknown ones", () => {
  assert.equal(personalize("Hola {{ first_name }} desde {{city}} {{unknown}}", { first_name: "Ana", city: "Madrid" }), "Hola Ana desde Madrid ");
});

test("tracked html rewrites links and includes unsubscribe and pixel", () => {
  const html = buildTrackedHtml({ html: '<a href="https://example.com/a">Abrir</a>', recipientId: "70000000-0000-4000-8000-000000000001", email: "ana@example.com", campaignId: "60000000-0000-4000-8000-000000000001", physicalAddress: "Madrid", trackOpens: true, trackClicks: true });
  assert.match(html, /\/t\/click\/70000000/);
  assert.match(html, /\/unsubscribe\//);
  assert.match(html, /\/t\/open\/70000000/);
});

test("campaign footer accepts opaque unsubscribe and preference links", () => {
  const html = buildTrackedHtml({
    html: "<p>Mensaje</p>", recipientId: "recipient", email: "ana@example.com", campaignId: "campaign",
    physicalAddress: "Madrid", trackOpens: false, trackClicks: false,
    unsubscribeUrl: "https://mail.example/unsubscribe/opaque", preferencesUrl: "https://mail.example/preferences/opaque",
  });
  assert.match(html, /https:\/\/mail\.example\/unsubscribe\/opaque/);
  assert.match(html, /https:\/\/mail\.example\/preferences\/opaque/);
  assert.match(html, /Gestionar preferencias/);
  assert.doesNotMatch(html, /\/t\/open\//);
});
