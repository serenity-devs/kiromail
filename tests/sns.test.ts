import assert from "node:assert/strict";
import test from "node:test";
import { snsStringToSign, validSnsCertificateUrl, type SnsEnvelope } from "../lib/sns";

test("SNS certificate URLs are restricted to the Amazon SNS HTTPS host", () => {
  assert.equal(validSnsCertificateUrl("https://sns.eu-west-1.amazonaws.com/SimpleNotificationService-abc123.pem"), true);
  assert.equal(validSnsCertificateUrl("http://sns.eu-west-1.amazonaws.com/SimpleNotificationService-abc123.pem"), false);
  assert.equal(validSnsCertificateUrl("https://sns.eu-west-1.amazonaws.com.evil.test/SimpleNotificationService-abc123.pem"), false);
  assert.equal(validSnsCertificateUrl("https://sns.eu-west-1.amazonaws.com/other.pem"), false);
});

test("SNS notification canonical string follows the documented field order", () => {
  const envelope: SnsEnvelope = {
    Type: "Notification", MessageId: "message-1", TopicArn: "arn:aws:sns:eu-west-1:123:events", Subject: "subject",
    Message: "line one\nline two", Timestamp: "2026-08-04T10:00:00.000Z", SignatureVersion: "2", Signature: "signature",
    SigningCertURL: "https://sns.eu-west-1.amazonaws.com/SimpleNotificationService-abc123.pem",
  };
  assert.equal(snsStringToSign(envelope), "Message\nline one\nline two\nMessageId\nmessage-1\nSubject\nsubject\nTimestamp\n2026-08-04T10:00:00.000Z\nTopicArn\narn:aws:sns:eu-west-1:123:events\nType\nNotification\n");
});
