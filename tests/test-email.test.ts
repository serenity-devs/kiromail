import assert from "node:assert/strict";
import test from "node:test";
import { testEmailConfirmation } from "../lib/test-email";

test("campaign test send distinguishes SES acceptance from Mailpit delivery", () => {
  assert.equal(
    testEmailConfirmation({
      sent: true,
      transport: "ses",
      region: "eu-west-1",
      provider_message_id: "ses-message-id",
      status: "provider_accepted",
    }),
    "Aceptado por Amazon SES · ses-message-id",
  );
  assert.equal(
    testEmailConfirmation({
      sent: true,
      transport: "smtp",
      region: "eu-west-1",
      provider_message_id: "smtp-message-id",
      status: "delivered",
    }),
    "Entregado a Mailpit",
  );
});
