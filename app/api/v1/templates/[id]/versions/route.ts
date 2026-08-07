import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateApiRequest } from "@/lib/api-auth";
import { collectAssetUsages } from "@/lib/assets";
import { sql } from "@/lib/db";
import { templateDiagnostics } from "@/lib/template-service";
import { headerText } from "@/lib/validation";

const schema = z.object({
  subject: headerText(1,998), preview_text: z.string().max(200).default(""),
  html: z.string().min(1).max(2_000_000), text: z.string().max(2_000_000).default(""),
  source_format: z.enum(["html", "visual"]).default("html"),
  visual_document: z.record(z.string(), z.unknown()).nullable().optional(),
  variables_schema: z.record(z.string(), z.object({ type: z.string().optional(), required: z.boolean().optional(), default: z.unknown().optional() })).default({}),
  change_note: z.string().trim().max(500).default("Guardado manual"),
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const principal = await authenticateApiRequest(request, "templates:write");
  if (!principal) return NextResponse.json({ error: { code: "unauthorized", message: "No autorizado" } }, { status: 401 });
  try {
    const { id } = await context.params;
    const input = schema.parse(await request.json());
    const storedVariables = JSON.parse(JSON.stringify(input.variables_schema)) as never;
    const storedDocument = input.visual_document ? JSON.parse(JSON.stringify(input.visual_document)) as never : null;
    const [version] = await sql`
      INSERT INTO template_versions (template_id, version_number, status, source_format, subject, preview_text, html_content, text_content, visual_document, variables_schema, created_by, change_note)
      SELECT t.id, COALESCE((SELECT max(version_number)+1 FROM template_versions WHERE template_id=t.id),1), 'draft', ${input.source_format},
        ${input.subject}, ${input.preview_text}, ${input.html}, ${input.text}, ${storedDocument ? sql.json(storedDocument) : null}, ${sql.json(storedVariables)},
        ${principal.kind === "session" ? principal.id : null}, ${input.change_note}
      FROM templates t WHERE t.id=${id} AND t.status <> 'archived' RETURNING *
    `;
    if (!version) return NextResponse.json({ error: { code: "not_found", message: "Plantilla no encontrada" } }, { status: 404 });
    for(const usage of collectAssetUsages(input.visual_document))await sql`INSERT INTO asset_usages(asset_id,template_version_id,block_id)SELECT id,${version.id},${usage.blockId} FROM assets WHERE id=${usage.assetId} ON CONFLICT DO NOTHING`;
    await sql`UPDATE templates SET updated_at=now() WHERE id=${id}`;
    await sql`INSERT INTO audit_log(action,entity_type,entity_id,user_id,api_key_id,detail)VALUES('create','template_version',${version.id},${principal.kind==="session"?principal.id:null},${principal.kind==="api_key"?principal.id:null},${sql.json({template_id:id,version_number:version.version_number,change_note:input.change_note})})`;
    return NextResponse.json({ ...version, diagnostics: templateDiagnostics(version as never) }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: { code: "validation_error", message: "Datos no válidos", issues: error.issues } }, { status: 422 });
    console.error(error); return NextResponse.json({ error: { code: "internal_error", message: "No se pudo crear la versión" } }, { status: 500 });
  }
}
