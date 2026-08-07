import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateApiRequest } from "@/lib/api-auth";
import { sql } from "@/lib/db";
import { preconditionResponse, requireIfMatch, staleResourceResponse, versionedJson } from "@/lib/http-concurrency";

const patchSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(), folder: z.string().trim().max(200).optional(),
  list_id: z.string().uuid().nullable().optional(),
  status:z.enum(["draft","published","archived"]).optional(),
}).refine((value) => Object.keys(value).length > 0);

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const principal = await authenticateApiRequest(request, "templates:read");
  if (!principal) return NextResponse.json({ error: { code: "unauthorized", message: "No autorizado" } }, { status: 401 });
  const { id } = await context.params;
  const [template] = await sql`SELECT * FROM templates WHERE id=${id}`;
  if (!template) return NextResponse.json({ error: { code: "not_found", message: "Plantilla no encontrada" } }, { status: 404 });
  const versions = await sql`
    SELECT v.id, v.version_number, v.status, v.source_format, v.subject, v.preview_text, v.html_content AS html, v.text_content AS text,
      v.visual_document, v.variables_schema, v.change_note, v.restored_from_version_id, source.version_number AS restored_from_version_number,
      v.created_at, v.published_at, u.name AS created_by_name
    FROM template_versions v LEFT JOIN users u ON u.id=v.created_by LEFT JOIN template_versions source ON source.id=v.restored_from_version_id
    WHERE v.template_id=${id} ORDER BY v.version_number DESC
  `;
  return versionedJson(request,{ ...template, versions },"template",id,template.revision);
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const principal = await authenticateApiRequest(request, "templates:write");
  if (!principal) return NextResponse.json({ error: { code: "unauthorized", message: "No autorizado" } }, { status: 401 });
  try {
    const { id } = await context.params;
    const revision=requireIfMatch(request,"template",id);const input = patchSchema.parse(await request.json());
    const [template] = await sql.begin(async tx=>{const[updated]=await tx`
      UPDATE templates SET name=COALESCE(${input.name ?? null},name), folder=COALESCE(${input.folder ?? null},folder),
        list_id=CASE WHEN ${input.list_id === undefined} THEN list_id ELSE ${input.list_id ?? null} END,status=COALESCE(${input.status??null},status),
        archived_at=CASE WHEN ${input.status??null}='archived' THEN COALESCE(archived_at,now()) WHEN ${input.status??null} IN('draft','published') THEN NULL ELSE archived_at END, updated_at=now()
      WHERE id=${id} AND revision=${revision} RETURNING *
    `;if(updated)await tx`INSERT INTO audit_log(action,entity_type,entity_id,user_id,api_key_id,detail)VALUES(${input.status==="archived"?"archive":input.status?"restore":"update"},'template',${id},${principal.kind==="session"?principal.id:null},${principal.kind==="api_key"?principal.id:null},${tx.json({status:input.status??updated.status,folder:input.folder})})`;return[updated];});
    if (!template) return staleResourceResponse();
    return versionedJson(request,template,"template",id,template.revision);
  } catch (error) {
    const precondition=preconditionResponse(error);if(precondition)return precondition;
    if (error instanceof z.ZodError) return NextResponse.json({ error: { code: "validation_error", message: "Datos no válidos", issues: error.issues } }, { status: 422 });
    throw error;
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const principal = await authenticateApiRequest(request, "templates:write");
  if (!principal) return NextResponse.json({ error: { code: "unauthorized", message: "No autorizado" } }, { status: 401 });
  try{const { id } = await context.params;const revision=requireIfMatch(request,"template",id);
  const [template] = await sql`UPDATE templates SET status='archived', archived_at=now(), updated_at=now() WHERE id=${id} AND revision=${revision} AND status<>'archived' RETURNING id,revision`;
  if (!template) return staleResourceResponse();
  return versionedJson(request,{ archived: true },"template",id,template.revision);}catch(error){const precondition=preconditionResponse(error);if(precondition)return precondition;throw error;}
}
