import { NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/api-auth";
import { sql } from "@/lib/db";
import { templateDiagnostics, type TemplateVersion } from "@/lib/template-service";

export async function POST(request: Request, context: { params: Promise<{ id: string; versionId: string }> }) {
  const principal = await authenticateApiRequest(request, "templates:write");
  if (!principal) return NextResponse.json({ error: { code: "unauthorized", message: "No autorizado" } }, { status: 401 });
  const { id, versionId } = await context.params;
  const [version] = await sql<TemplateVersion[]>`SELECT * FROM template_versions WHERE id=${versionId} AND template_id=${id}`;
  if (!version) return NextResponse.json({ error: { code: "not_found", message: "Versión no encontrada" } }, { status: 404 });
  const diagnostics = templateDiagnostics(version);
  if (!diagnostics.valid) return NextResponse.json({ error: { code: "template_invalid", message: "La versión no se puede publicar", diagnostics } }, { status: 422 });
  await sql.begin(async (tx) => {
    await tx`UPDATE template_versions SET status='archived' WHERE template_id=${id} AND status='published' AND id<>${versionId}`;
    await tx`UPDATE template_versions SET status='published', published_at=COALESCE(published_at,now()) WHERE id=${versionId}`;
    await tx`
      UPDATE templates t SET status='published', published_version_id=${versionId}, subject=v.subject, preview_text=v.preview_text,
        html_content=v.html_content, text_content=v.text_content, format=v.source_format, variables_schema=v.variables_schema, updated_at=now()
      FROM template_versions v WHERE t.id=${id} AND v.id=${versionId}
    `;
    await tx`INSERT INTO audit_log (action, entity_type, entity_id, user_id, api_key_id, detail)
      VALUES ('publish', 'template_version', ${versionId}, ${principal.kind === "session" ? principal.id : null}, ${principal.kind === "api_key" ? principal.id : null}, ${tx.json({ template_id: id, version_number: version.version_number })})`;
  });
  return NextResponse.json({ published: true, template_id: id, version_id: versionId, version_number: version.version_number, diagnostics });
}
