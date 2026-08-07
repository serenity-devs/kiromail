import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateApiRequest } from "@/lib/api-auth";
import { anonymizeContact, ContactPrivacyError, mergeContacts } from "@/lib/contact-privacy";
import { sql } from "@/lib/db";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("block"), reason: z.string().trim().min(1).max(500) }),
  z.object({ action: z.literal("unblock"), reason: z.string().trim().max(500).default("") }),
  z.object({ action: z.literal("anonymize"), reason: z.string().trim().min(1).max(500) }),
  z.object({ action: z.literal("merge"), survivor_contact_id: z.string().uuid(), field_strategy: z.enum(["target", "source", "fill_empty"]).default("fill_empty"), reason: z.string().trim().min(1).max(500) }),
]);

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const principal = await authenticateApiRequest(request, "contacts:write");
  if (!principal) return NextResponse.json({ error: { code: "unauthorized", message: "No autorizado" } }, { status: 401 });
  try {
    const { id } = await context.params;
    const input = schema.parse(await request.json());
    const actor = { userId: principal.kind === "session" ? principal.id : null, apiKeyId: principal.kind === "api_key" ? principal.id : null };
    if (input.action === "anonymize") return NextResponse.json(await anonymizeContact(id, input.reason, actor));
    if (input.action === "merge") return NextResponse.json(await mergeContacts(id, input.survivor_contact_id, input.field_strategy, input.reason, actor));

    const [current] = await sql<{ email: string; status: string; merged_into_contact_id: string | null; anonymized_at: Date | null }[]>`
      SELECT email,status,merged_into_contact_id,anonymized_at FROM contacts WHERE id=${id}
    `;
    if (!current) return NextResponse.json({ error: { code: "not_found", message: "Contacto no encontrado" } }, { status: 404 });
    if (current.merged_into_contact_id || current.anonymized_at) return NextResponse.json({ error: { code: "contact_inactive", message: "El contacto está fusionado o anonimizado" } }, { status: 409 });

    if (input.action === "block") {
      await sql.begin(async tx => {
        await tx`UPDATE contacts SET status='blocked',updated_at=now() WHERE id=${id}`;
        await tx`
          INSERT INTO suppressions(email,reason,source,scope,detail)
          VALUES(${current.email},'manual','api','all',${tx.json({ reason: input.reason })})
          ON CONFLICT(lower(email),scope) DO UPDATE SET
            reason='manual',source='api',detail=EXCLUDED.detail,status='active',resolved_at=NULL,
            resolved_by=NULL,resolution_note='',updated_at=now()
        `;
        await tx`INSERT INTO audit_log(action,entity_type,entity_id,user_id,api_key_id,detail) VALUES('block','contact',${id},${actor.userId},${actor.apiKeyId},${tx.json({ reason: input.reason })})`;
      });
      return NextResponse.json({ status: "blocked" });
    }

    await sql.begin(async tx => {
      await tx`
        UPDATE suppressions SET status='resolved',resolved_at=now(),resolved_by=${actor.userId},
          resolution_note=${input.reason || "Desbloqueo explícito"},updated_at=now()
        WHERE lower(email)=lower(${current.email}) AND scope='all' AND reason='manual' AND status='active'
      `;
      const [remaining] = await tx<{ count: number }[]>`
        SELECT count(*)::int AS count FROM suppressions
        WHERE lower(email)=lower(${current.email}) AND scope='all' AND status='active'
      `;
      if (remaining.count === 0) await tx`UPDATE contacts SET status='active',updated_at=now() WHERE id=${id} AND status='blocked'`;
      await tx`INSERT INTO audit_log(action,entity_type,entity_id,user_id,api_key_id,detail) VALUES('unblock','contact',${id},${actor.userId},${actor.apiKeyId},${tx.json({ reason: input.reason })})`;
    });
    return NextResponse.json({ status: "active" });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: { code: "validation_error", message: "Datos no válidos", issues: error.issues } }, { status: 422 });
    if (error instanceof ContactPrivacyError) return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.status });
    console.error(error);
    return NextResponse.json({ error: { code: "action_failed", message: "No se pudo ejecutar la acción" } }, { status: 500 });
  }
}
