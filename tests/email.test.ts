import assert from "node:assert/strict";
import test from "node:test";
import { buildTrackedHtml, personalize, withCampaignTemplateVariables } from "../lib/email";

test("personalize replaces known values and clears unknown ones", () => {
  assert.equal(personalize("Hola {{ first_name }} desde {{city}} {{unknown}}", { first_name: "Ana", city: "Madrid" }), "Hola Ana desde Madrid ");
});

test("tracked html rewrites content links and includes the open pixel", () => {
  const html = buildTrackedHtml({ html: '<a href="https://example.com/a">Abrir</a>', recipientId: "70000000-0000-4000-8000-000000000001", trackOpens: true, trackClicks: true });
  assert.match(html, /\/t\/click\/70000000/);
  assert.match(html, /\/t\/open\/70000000/);
  assert.doesNotMatch(html, /Darme de baja/);
});

test("tracking preserves unsubscribe and preference links placed by the template", () => {
  const html = buildTrackedHtml({
    html: '<a href="https://mail.example/unsubscribe/opaque">Baja</a><a href="https://mail.example/preferences/opaque">Preferencias</a><a href="https://example.com">Web</a>',
    recipientId: "recipient", trackOpens: false, trackClicks: true,
    unsubscribeUrl: "https://mail.example/unsubscribe/opaque", preferencesUrl: "https://mail.example/preferences/opaque",
  });
  assert.match(html, /https:\/\/mail\.example\/unsubscribe\/opaque/);
  assert.match(html, /https:\/\/mail\.example\/preferences\/opaque/);
  assert.match(html, /\/t\/click\/recipient/);
});

test("campaign template variables render a manually designed footer", () => {
  const data = withCampaignTemplateVariables({ first_name: "Ana" }, {
    unsubscribeUrl: "https://mail.example/unsubscribe/test-preview",
    preferencesUrl: "https://mail.example/preferences/test-preview",
    physicalAddress: "Calle Mayor 1, Madrid",
  });
  const html = personalize('<footer>{{physical_address}} · <a href="{{unsubscribe_url}}">Baja</a> · <a href="{{preferences_url}}">Preferencias</a></footer>', data);
  assert.match(html, /Calle Mayor 1, Madrid/);
  assert.match(html, /\/unsubscribe\/test-preview/);
  assert.match(html, /\/preferences\/test-preview/);
});
