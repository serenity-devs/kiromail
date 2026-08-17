import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  shouldRequeueTransactionalFailure,
  transportAcceptanceEventType,
  transportAcceptedStatus,
} from "../lib/transactional-lifecycle";

test("SES acceptance is distinct from the later SEND event", () => {
  assert.equal(transportAcceptanceEventType("ses"), "provider_accepted");
  assert.equal(transportAcceptedStatus("ses"), "sent");
});

test("SMTP records its local acceptance and delivery explicitly", () => {
  assert.equal(transportAcceptanceEventType("smtp"), "sent");
  assert.equal(transportAcceptedStatus("smtp"), "delivered");
});

test("a provider-accepted message is not automatically sent twice", () => {
  assert.equal(
    shouldRequeueTransactionalFailure("provider_acceptance_unconfirmed"),
    false,
  );
  assert.equal(shouldRequeueTransactionalFailure("transport_error"), true);
  assert.equal(shouldRequeueTransactionalFailure("worker_error"), true);
});

test("the reliability migration repairs historical SES state", () => {
  const migration = readFileSync(
    "db/migrations/029_transactional_delivery_reliability.sql",
    "utf8",
  );
  assert.match(migration, /SET type = 'provider_accepted'/);
  assert.match(migration, /WITH latest_send AS/);
  assert.match(migration, /UPDATE outbound_messages message/);
  assert.match(migration, /UPDATE message_send_attempts attempt/);
});
