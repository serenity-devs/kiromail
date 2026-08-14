import assert from "node:assert/strict";
import test from "node:test";
import { assertMimeWithinLimit, buildTransactionalMime } from "../lib/transactional-mime";

const base = {
  messageId: "11111111-1111-4111-8111-111111111111",
  acceptedAt: new Date("2026-08-04T12:00:00.000Z"),
  from: { email: "news@example.com", name: "KiroMail" },
  to: { email: "ana@example.net", name: "Ana" },
  replyTo: "reply@example.com",
  subject: "Informe de agosto",
  html: "<h1>Hola, Ana</h1>",
  text: "Hola, Ana",
};

test("transactional MIME contains headers, alternatives and encoded attachment", async () => {
  const attachment = Buffer.from("contenido de prueba");
  const mime = await buildTransactionalMime({
    ...base,
    attachments: [{ filename: "informe.txt", content: attachment, contentType: "text/plain", disposition: "attachment" }],
  });
  const source = mime.toString("utf8");
  assert.match(source, /Message-ID: <11111111-1111-4111-8111-111111111111@kiromail\.local>/i);
  assert.match(source, /From: KiroMail <news@example\.com>/i);
  assert.match(source, /X-KiroMail-Channel: transactional/i);
  assert.match(source, /multipart\/mixed/i);
  assert.match(source, /multipart\/alternative/i);
  assert.match(source, /filename=informe\.txt/i);
  assert.match(source, new RegExp(attachment.toString("base64")));
  assert.equal(assertMimeWithinLimit(mime, mime.byteLength), mime.byteLength);
});

test("transactional MIME size validation measures the final encoded bytes", async () => {
  const rawAttachment = Buffer.alloc(3000, 0x61);
  const withoutAttachment = await buildTransactionalMime(base);
  const withAttachment = await buildTransactionalMime({
    ...base,
    attachments: [{ filename: "data.csv", content: rawAttachment, contentType: "text/csv", disposition: "attachment" }],
  });
  assert.ok(withAttachment.byteLength > withoutAttachment.byteLength + rawAttachment.byteLength);
  assert.throws(
    () => assertMimeWithinLimit(withAttachment, withAttachment.byteLength - 1),
    (error: Error & { code?: string; status?: number; mimeByteSize?: number }) =>
      error.code === "message_too_large" && error.status === 413 && error.mimeByteSize === withAttachment.byteLength,
  );
});
