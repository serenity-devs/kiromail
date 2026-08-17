import assert from "node:assert/strict";
import test from "node:test";
import {
  meaningfulCampaignOpenPredicate,
  nonOpenerCampaignTargetPredicate,
} from "../lib/campaign-targeting";

test("non-opener targeting requires a sent original recipient and no meaningful open", () => {
  const result = nonOpenerCampaignTargetPredicate("$2");
  assert.match(result, /campaign_id::text=\$2::text/);
  assert.match(result, /sent_at IS NOT NULL/);
  assert.match(result, /NOT \(EXISTS/);
  assert.match(result, /NOT open_event\.is_automated/);
  assert.doesNotMatch(result, /opened_at IS NULL/);
});

test("meaningful opens keep the legacy opened_at fallback", () => {
  const result = meaningfulCampaignOpenPredicate("recipient");
  assert.match(result, /recipient\.opened_at IS NOT NULL/);
  assert.match(result, /NOT EXISTS/);
  assert.match(result, /any_open_event/);
});

test("targeting helpers reject interpolated SQL identifiers and parameters", () => {
  assert.throws(() => meaningfulCampaignOpenPredicate("recipient; DELETE"));
  assert.throws(() => nonOpenerCampaignTargetPredicate("campaign-id"));
});
