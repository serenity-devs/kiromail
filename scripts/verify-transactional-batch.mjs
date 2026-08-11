import { createHash, randomBytes, randomUUID } from "node:crypto";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL es obligatoria");

const baseUrl = process.env.VERIFY_BASE_URL ?? "http://localhost:3000";
const mailpitUrl = process.env.VERIFY_MAILPIT_URL ?? "http://mailpit:8025";
const sql = postgres(databaseUrl, { max: 1 });
const runId = randomUUID();
const prefix = `verify_${runId.replaceAll("-", "").slice(0, 12)}`;
const token = `sm_live_${prefix}_${randomBytes(32).toString("base64url")}`;
const secretHash = createHash("sha256").update(token).digest("hex");
const suppressedEmail = `batch-suppressed-${runId}@example.com`;
let apiKeyId;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function api(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...(options.headers ?? {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${options.method ?? "GET"} ${path}: ${response.status} ${JSON.stringify(body)}`);
  return { response, body };
}

async function waitForMessage(id) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const { body } = await api(`/api/v1/transactional/messages/${id}`);
    if (["delivered", "failed", "sent"].includes(body.status)) return body;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`El mensaje ${id} no terminó a tiempo`);
}

try {
  const [key] = await sql`
    INSERT INTO api_keys(name,prefix,secret_hash,scopes)
    VALUES('Verificación transaccional E2E',${prefix},${secretHash},${["templates:write", "templates:read", "transactional:send", "transactional:read"]})
    RETURNING id
  `;
  apiKeyId = key.id;
  await sql`
    INSERT INTO suppressions(email,reason,source,scope,detail)
    VALUES(${suppressedEmail},'manual','transactional_batch_e2e','all',${sql.json({ run_id: runId })})
  `;

  const pdf = Buffer.from(`%PDF-1.4\n% KiroMail E2E ${runId}\n1 0 obj<</Type/Catalog>>endobj\n%%EOF\n`);
  const form = new FormData();
  form.append("file", new Blob([pdf], { type: "application/pdf" }), `factura-${runId}.pdf`);
  form.append("name", `Factura E2E ${runId.slice(0, 8)}`);
  form.append("folder", "Verificación transaccional");
  const { response: assetResponse, body: asset } = await api("/api/v1/assets", { method: "POST", body: form });
  assert(assetResponse.status === 201, "El activo PDF no se creó");
  assert(asset.mime_type === "application/pdf", "El MIME persistido del PDF no es correcto");

  const subject = `Lote con adjunto E2E ${runId.slice(0, 8)}`;
  const batchPayload = {
    messages: [
      {
        to: { email: "batch-attachment-e2e@example.com", name: "Cliente E2E" },
        subject,
        html: `<main><h1>Factura preparada</h1><p>Prueba ${runId}</p></main>`,
        text: `Factura preparada. Prueba ${runId}`,
        metadata: { run_id: runId, order_id: "E2E-1042" },
        attachments: [{ asset_id: asset.id, filename: "factura-e2e.pdf" }],
      },
      {
        to: { email: suppressedEmail },
        subject: `No debe aceptarse ${runId}`,
        html: "<p>Este destinatario está suprimido.</p>",
      },
    ],
  };
  const batchKey = `batch-${runId}`;
  const firstBatch = await api("/api/v1/transactional/batch", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": batchKey }, body: JSON.stringify(batchPayload) });
  assert(firstBatch.response.status === 202, "El lote no fue aceptado con 202");
  assert(firstBatch.body.accepted === 1 && firstBatch.body.failed === 1, "El resultado parcial del lote es incorrecto");
  assert(firstBatch.body.results[1]?.error?.code === "recipient_suppressed", "No se registró la supresión por elemento");
  const secondBatch = await api("/api/v1/transactional/batch", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": batchKey }, body: JSON.stringify(batchPayload) });
  assert(secondBatch.body.id === firstBatch.body.id && secondBatch.body.duplicate === true, "La repetición del lote no fue idempotente");
  const batchStatus = await api(`/api/v1/transactional/batches/${firstBatch.body.id}`);
  assert(batchStatus.body.status === "completed" && batchStatus.body.accepted_count === 1, "El estado persistido del lote es incorrecto");

  const delivered = await waitForMessage(firstBatch.body.results[0].id);
  assert(delivered.status === "delivered", `El mensaje con adjunto terminó como ${delivered.status}`);
  assert(delivered.has_mime === true && Number(delivered.mime_byte_size) > pdf.byteLength, "No se persistió el MIME codificado con su tamaño exacto");
  assert(delivered.attachments.length === 1 && delivered.attachments[0].filename === "factura-e2e.pdf", "El adjunto no aparece en el registro exacto");
  assert(delivered.attempts.some((item) => item.status === "succeeded"), "No existe un intento de transporte exitoso");
  const [storedMime] = await sql`
    SELECT m.mime_blob_id,m.mime_byte_size,b.byte_size,b.mime_type,
      (SELECT (payload->>'mime_byte_size')::bigint FROM email_events WHERE message_id=m.id AND type='send_attempted' ORDER BY occurred_at DESC LIMIT 1) AS attempted_size
    FROM outbound_messages m JOIN content_blobs b ON b.id=m.mime_blob_id WHERE m.id=${delivered.id}
  `;
  assert(Number(storedMime.mime_byte_size) === Number(storedMime.byte_size), "El tamaño registrado no coincide con el blob RFC/MIME");
  assert(Number(storedMime.attempted_size) === Number(storedMime.byte_size) && storedMime.mime_type === "message/rfc822", "El worker no usó el tamaño MIME persistido");

  const mailpitList = await (await fetch(`${mailpitUrl}/api/v1/messages`)).json();
  const mailpitMessage = mailpitList.messages.find((item) => item.Subject === subject);
  assert(mailpitMessage?.Attachments === 1, "Mailpit no recibió el PDF como adjunto MIME");
  const mailpitDetail = await (await fetch(`${mailpitUrl}/api/v1/message/${mailpitMessage.ID}`)).json();
  assert(mailpitDetail.Attachments?.some((item) => item.FileName === "factura-e2e.pdf" || item.Filename === "factura-e2e.pdf"), "El detalle MIME de Mailpit no conserva el nombre del PDF");
  const mailpitRaw = await fetch(`${mailpitUrl}/api/v1/message/${mailpitMessage.ID}/raw`);
  const receivedMimeBytes = (await mailpitRaw.arrayBuffer()).byteLength;
  assert(mailpitRaw.ok && receivedMimeBytes >= Number(storedMime.byte_size), "Mailpit no conserva el MIME completo recibido");

  const [failedSource] = await sql`
    INSERT INTO outbound_messages(
      kind,template_version_id,to_email,to_name,from_email,from_name,reply_to,subject,status,
      html_blob_id,text_blob_id,variables,metadata,track_opens,track_clicks,attempt_count,
      failure_code,failure_reason,accepted_at,queued_at,processed_at
    )
    SELECT kind,template_version_id,to_email,to_name,from_email,from_name,reply_to,subject,'failed',
      html_blob_id,text_blob_id,variables,metadata,track_opens,track_clicks,1,
      'e2e_transport_error','Fallo controlado para verificar reintento manual',now(),now(),now()
    FROM outbound_messages WHERE id=${delivered.id}
    RETURNING id
  `;
  await sql`
    INSERT INTO message_attachments(message_id,blob_id,asset_id,filename,content_type,disposition,content_id)
    SELECT ${failedSource.id},blob_id,asset_id,filename,content_type,disposition,content_id
    FROM message_attachments WHERE message_id=${delivered.id}
  `;
  await sql`
    INSERT INTO message_send_attempts(message_id,attempt_number,kind,status,transport,error_code,error_message,finished_at)
    VALUES(${failedSource.id},1,'automatic','failed','smtp','e2e_transport_error','Fallo controlado',now())
  `;
  await sql`
    INSERT INTO email_events(event_key,message_id,type,source,payload)
    VALUES(${`e2e:${failedSource.id}:failed`},${failedSource.id},'failed','e2e',${sql.json({ controlled: true })})
  `;

  const retryKey = `retry-${runId}`;
  const firstRetry = await api(`/api/v1/transactional/messages/${failedSource.id}/retry`, { method: "POST", headers: { "Idempotency-Key": retryKey } });
  const secondRetry = await api(`/api/v1/transactional/messages/${failedSource.id}/retry`, { method: "POST", headers: { "Idempotency-Key": retryKey } });
  assert(firstRetry.body.id === secondRetry.body.id && secondRetry.body.duplicate === true, "El reintento manual no fue idempotente");
  const retried = await waitForMessage(firstRetry.body.id);
  assert(retried.status === "delivered" && retried.retry_of_message_id === failedSource.id, "El nuevo mensaje no conserva el vínculo de reintento");
  assert(retried.has_mime === true && Number(retried.mime_byte_size) > pdf.byteLength, "El reintento no regeneró su propio MIME inmutable");
  assert(retried.attachments.length === 1, "El reintento no conserva el adjunto inmutable");
  assert(retried.attempts.some((item) => item.kind === "manual_retry" && item.status === "succeeded"), "El intento manual no quedó trazado");

  console.log(JSON.stringify({
    ok: true,
    run_id: runId,
    asset_id: asset.id,
    batch_id: firstBatch.body.id,
    batch_message_id: delivered.id,
    suppressed_result: firstBatch.body.results[1].error.code,
    failed_source_id: failedSource.id,
    retry_message_id: retried.id,
    mailpit_attachment: mailpitMessage.Attachments,
    mime_byte_size: Number(storedMime.byte_size),
    mailpit_raw_byte_size: receivedMimeBytes,
  }, null, 2));
} finally {
  await sql`
    UPDATE suppressions SET status='resolved',resolved_at=now(),resolution_note='Verificación E2E finalizada',updated_at=now()
    WHERE lower(email)=lower(${suppressedEmail}) AND source='transactional_batch_e2e' AND status='active'
  `;
  if (apiKeyId) await sql`UPDATE api_keys SET revoked_at=now() WHERE id=${apiKeyId}`;
  await sql.end();
}
