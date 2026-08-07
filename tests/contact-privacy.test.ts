import assert from "node:assert/strict";
import test from "node:test";
import { conservativeSubscriptionStatus } from "../lib/contact-privacy";

test("contact merge never reactivates an unsubscribed subscription", () => {
  assert.equal(conservativeSubscriptionStatus("active", "unsubscribed"), "unsubscribed");
  assert.equal(conservativeSubscriptionStatus("unsubscribed", "pending"), "unsubscribed");
});

test("archived and pending states also remain conservative", () => {
  assert.equal(conservativeSubscriptionStatus("active", "archived"), "archived");
  assert.equal(conservativeSubscriptionStatus("active", "pending"), "pending");
  assert.equal(conservativeSubscriptionStatus("active", "active"), "active");
});
