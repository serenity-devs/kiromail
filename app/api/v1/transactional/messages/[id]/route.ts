import { NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/api-auth";
import { sql } from "@/lib/db";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const principal = await authenticateApiRequest(request, "transactional:read");
  if (!principal) return NextResponse.json({ error: { code: "unauthorized", message: "No autorizado" } }, { status: 401 });
  const { id } = await context.params;
  const [message] = await sql`
    SELECT m.id, m.to_email, m.to_name, m.from_email, m.from_name, m.reply_to, m.subject, m.status,
      m.variables, m.metadata, m.template_version_id, m.ses_message_id, m.attempt_count, m.mime_byte_size, m.failure_code,
      m.failure_reason, m.accepted_at, m.queued_at, m.processed_at, m.sent_at, m.delivered_at,
      m.first_opened_at, m.first_clicked_at, m.batch_id, m.batch_position, m.retry_of_message_id, m.created_at, m.updated_at,
      (m.html_blob_id IS NOT NULL) AS has_html, (m.text_blob_id IS NOT NULL) AS has_text, (m.mime_blob_id IS NOT NULL) AS has_mime
    FROM outbound_messages m WHERE m.id=${id} AND m.kind='transactional'
  `;
  if (!message) return NextResponse.json({ error: { code: "not_found", message: "Mensaje no encontrado" } }, { status: 404 });
  const events = await sql`
    SELECT id, type, source, ses_message_id, link_url, payload, occurred_at, received_at, is_automated
    FROM email_events WHERE message_id=${id} ORDER BY occurred_at, id
  `;
  const attachments=await sql`SELECT ma.id,ma.asset_id,ma.filename,ma.content_type,ma.disposition,ma.content_id,a.byte_size FROM message_attachments ma LEFT JOIN assets a ON a.id=ma.asset_id WHERE ma.message_id=${id} ORDER BY ma.created_at,ma.id`;
  const attempts=await sql`SELECT id,attempt_number,kind,status,transport,provider_message_id,error_code,error_message,started_at,finished_at FROM message_send_attempts WHERE message_id=${id} ORDER BY attempt_number`;
  return NextResponse.json({ ...message, events,attachments,attempts,can_retry:message.status==='failed'&&!message.ses_message_id, html_url: `/api/v1/transactional/messages/${id}/content?part=html`, text_url: `/api/v1/transactional/messages/${id}/content?part=text` });
}
