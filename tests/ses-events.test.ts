import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeSesBounce,
  normalizeSesDeliveryDelay,
} from "../lib/ses-events";

test("SES permanent bounces become suppressible hard bounces", () => {
  const result = normalizeSesBounce(
    {
      bounceType: "Permanent",
      bounceSubType: "General",
      bouncedRecipients: [
        {
          emailAddress: "User@example.com",
          action: "failed",
          status: "5.1.1",
          diagnosticCode: "smtp; 550 user unknown",
        },
      ],
    },
    "user@example.com",
  );
  assert.equal(result.bounce_class, "hard");
  assert.equal(result.failure_code, "hard_bounce");
  assert.equal(result.should_suppress, true);
  assert.equal(result.recipient?.status, "5.1.1");
  assert.match(result.failure_reason, /550 user unknown/);
});

test("SES transient bounces are final for the message but do not suppress", () => {
  const result = normalizeSesBounce(
    {
      bounceType: "Transient",
      bounceSubType: "MailboxFull",
      bouncedRecipients: [
        { emailAddress: "user@example.com", status: "4.2.2" },
      ],
    },
    "user@example.com",
  );
  assert.equal(result.bounce_class, "soft");
  assert.equal(result.failure_code, "soft_bounce_final");
  assert.equal(result.should_suppress, false);
  assert.match(result.failure_reason, /MailboxFull/);
});

test("unknown SES bounce types remain explicit and non-suppressing", () => {
  const result = normalizeSesBounce(
    { bounceType: "Undetermined", bounceSubType: "Undetermined" },
    "user@example.com",
  );
  assert.equal(result.bounce_class, "undetermined");
  assert.equal(result.failure_code, "undetermined_bounce");
  assert.equal(result.should_suppress, false);
});

test("delivery delays preserve the retry expiry and SMTP diagnostic", () => {
  const result = normalizeSesDeliveryDelay(
    {
      delayType: "TransientCommunicationFailure",
      expirationTime: "2026-08-16T10:00:00.000Z",
      delayedRecipients: [
        {
          emailAddress: "user@example.com",
          status: "4.4.1",
          diagnosticCode: "smtp; 421 unable to connect",
        },
      ],
    },
    "user@example.com",
  );
  assert.equal(result.delay_type, "TransientCommunicationFailure");
  assert.equal(result.expiration_time, "2026-08-16T10:00:00.000Z");
  assert.match(result.failure_reason, /421 unable to connect/);
});
