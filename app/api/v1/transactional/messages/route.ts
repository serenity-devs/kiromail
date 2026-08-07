import { NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/api-auth";
import { sql } from "@/lib/db";

export async function GET(request: Request) {
  const principal = await authenticateApiRequest(request, "transactional:read");
  if (!principal) return NextResponse.json({ error: { code: "unauthorized", message: "No autorizado" } }, { status: 401 });
  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const email = url.searchParams.get("email");
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 50), 1), 200);
  const messages = await sql`
    SELECT id, to_email, to_name, from_email, from_name, subject, status, metadata, template_version_id,
      ses_message_id, attempt_count, mime_byte_size, failure_code, failure_reason, accepted_at, queued_at, processed_at,
      sent_at, delivered_at, first_opened_at, first_clicked_at, created_at, updated_at
    FROM outbound_messages
    WHERE kind='transactional'
      AND (${status}::text IS NULL OR status=${status})
      AND (${email}::text IS NULL OR to_email ILIKE '%' || ${email} || '%')
    ORDER BY created_at DESC LIMIT ${limit}
  `;
  return NextResponse.json({ data: messages });
}
