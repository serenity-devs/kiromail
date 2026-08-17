import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateApiRequest } from "@/lib/api-auth";
import { getNonOpenerResendPreview } from "@/lib/campaign-service";
import { sql } from "@/lib/db";
import { versionedJson } from "@/lib/http-concurrency";

const schema = z.object({ name: z.string().trim().min(1).max(200).optional() });

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const principal = await authenticateApiRequest(request, "campaigns:read");
  if (!principal)
    return NextResponse.json(
      { error: { code: "unauthorized", message: "No autorizado" } },
      { status: 401 },
    );
  const { id } = await context.params;
  const preview = await getNonOpenerResendPreview(id);
  if (!preview)
    return NextResponse.json(
      { error: { code: "not_found", message: "Campaña no encontrada" } },
      { status: 404 },
    );
  return NextResponse.json({
    available: preview.available,
    eligible: preview.eligible,
    sent: preview.sent,
    opened: preview.opened,
    tracking_enabled: preview.tracking_enabled,
    reason: preview.reason,
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const principal = await authenticateApiRequest(request, "campaigns:write");
  if (!principal)
    return NextResponse.json(
      { error: { code: "unauthorized", message: "No autorizado" } },
      { status: 401 },
    );
  try {
    const { id } = await context.params;
    const input = schema.parse(await request.json().catch(() => ({})));
    const preview = await getNonOpenerResendPreview(id);
    if (!preview)
      return NextResponse.json(
        { error: { code: "not_found", message: "Campaña no encontrada" } },
        { status: 404 },
      );
    if (!preview.available)
      return NextResponse.json(
        {
          error: {
            code: "resend_unavailable",
            message: preview.reason ?? "No se puede preparar el reenvío",
          },
        },
        { status: 409 },
      );
    const defaultName = `${preview.source.name.slice(0, 170)} · reenvío no abiertos`;
    const row = await sql.begin(async (tx) => {
      const [created] = await tx`
        INSERT INTO campaigns(
          name,subject,preview_text,from_name,from_email,reply_to,template_id,
          target_type,target_id,status,list_id,template_version_id,content_source,
          html_content,text_content,content_snapshot,exclusion_segment_ids,
          track_opens,track_clicks,approval_required,duplicated_from_id
        )
        SELECT ${input.name ?? defaultName},subject,preview_text,from_name,from_email,
          reply_to,template_id,'non_openers',id,'draft',list_id,template_version_id,
          content_source,html_content,text_content,content_snapshot,
          exclusion_segment_ids,track_opens,track_clicks,approval_required,id
        FROM campaigns WHERE id=${id} AND status='completed' AND archived_at IS NULL
        RETURNING *
      `;
      if (!created) throw new Error("La campaña original ya no está disponible");
      await tx`
        INSERT INTO audit_log(action,entity_type,entity_id,user_id,api_key_id,detail)
        VALUES(
          'create_non_opener_resend','campaign',${created.id},
          ${principal.kind === "session" ? principal.id : null},
          ${principal.kind === "api_key" ? principal.id : null},
          ${tx.json({ source_campaign_id: id, eligible_at_creation: preview.eligible })}
        )
      `;
      return created;
    });
    return versionedJson(request, row, "campaign", row.id, row.version, 201);
  } catch (error) {
    if (error instanceof z.ZodError)
      return NextResponse.json(
        {
          error: {
            code: "validation_error",
            message: "Datos no válidos",
            issues: error.issues,
          },
        },
        { status: 422 },
      );
    console.error(error);
    return NextResponse.json(
      {
        error: {
          code: "resend_create_failed",
          message:
            error instanceof Error
              ? error.message
              : "No se pudo preparar el reenvío",
        },
      },
      { status: 422 },
    );
  }
}
