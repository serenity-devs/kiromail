import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateApiRequest } from "@/lib/api-auth";
import { collectAssetUsages } from "@/lib/assets";
import { sql } from "@/lib/db";
import { templateDiagnostics } from "@/lib/template-service";
import { headerText } from "@/lib/validation";
import { versionedItems,versionedJson } from "@/lib/http-concurrency";

const schema = z.object({
  key: z.string().trim().regex(/^[a-z][a-z0-9_\-]{1,159}$/),
  name: z.string().trim().min(1).max(200),
  channel: z.enum(["marketing", "transactional"]),
  format: z.enum(["html", "visual"]).default("html"),
  folder: z.string().trim().max(200).default(""),
  list_id: z.string().uuid().nullable().optional(),
  subject: headerText(1,998),
  preview_text: z.string().max(200).default(""),
  html: z.string().min(1).max(2_000_000),
  text: z.string().max(2_000_000).default(""),
  visual_document: z.record(z.string(), z.unknown()).nullable().optional(),
  variables_schema: z.record(z.string(), z.object({ type: z.string().optional(), required: z.boolean().optional(), default: z.unknown().optional() })).default({}),
  publish: z.boolean().default(false),
});

export async function GET(request: Request) {
  const principal = await authenticateApiRequest(request, "templates:read");
  if (!principal) return NextResponse.json({ error: { code: "unauthorized", message: "No autorizado" } }, { status: 401 });
  const url = new URL(request.url);
  const channel = url.searchParams.get("channel");
  const status = url.searchParams.get("status");
  const query = url.searchParams.get("q")?.trim() ?? "";
  const folder = url.searchParams.get("folder");
  const includeArchived = url.searchParams.get("include_archived") === "true";
  const sort = url.searchParams.get("sort") ?? "updated_desc";
  const rows = await sql`
    SELECT t.id, t.revision, t.key, t.name, t.channel, t.format, t.status, t.folder, t.list_id, t.published_version_id,
      t.duplicated_from_id,v.id AS version_id,v.version_number AS published_version_number,v.subject,v.preview_text,v.html_content,v.text_content,
      u.name AS author_name,(SELECT count(*)::int FROM campaigns c WHERE c.template_id=t.id OR c.template_version_id IN(SELECT id FROM template_versions WHERE template_id=t.id)) AS usage_count,t.created_at,t.updated_at,t.archived_at
    FROM templates t
    LEFT JOIN LATERAL(SELECT tv.* FROM template_versions tv WHERE tv.template_id=t.id ORDER BY (tv.id=t.published_version_id) DESC,tv.version_number DESC LIMIT 1)v ON TRUE
    LEFT JOIN users u ON u.id=v.created_by
    WHERE (${includeArchived} OR t.status<>'archived') AND (${channel}::text IS NULL OR t.channel=${channel}) AND (${status}::text IS NULL OR t.status=${status})
      AND (${folder}::text IS NULL OR t.folder=${folder}) AND (${query}='' OR t.name ILIKE '%'||${query}||'%' OR t.key ILIKE '%'||${query}||'%')
    ORDER BY CASE WHEN ${sort}='name_asc' THEN lower(t.name) END ASC,CASE WHEN ${sort}='created_desc' THEN t.created_at END DESC,t.updated_at DESC LIMIT 200
  `;
  return NextResponse.json({ data: versionedItems(rows as unknown as {id:string;revision:number}[],"template") });
}

export async function POST(request: Request) {
  const principal = await authenticateApiRequest(request, "templates:write");
  if (!principal) return NextResponse.json({ error: { code: "unauthorized", message: "No autorizado" } }, { status: 401 });
  try {
    const input = schema.parse(await request.json());
    const storedVariables = JSON.parse(JSON.stringify(input.variables_schema)) as never;
    const storedDocument = input.visual_document ? JSON.parse(JSON.stringify(input.visual_document)) as never : null;
    const diagnostics = templateDiagnostics({ subject: input.subject, html_content: input.html, text_content: input.text, variables_schema: input.variables_schema });
    if (input.publish && !diagnostics.valid) return NextResponse.json({ error: { code: "template_invalid", message: "La plantilla no se puede publicar", diagnostics } }, { status: 422 });
    const result = await sql.begin(async (tx) => {
      const [template] = await tx<{ id: string }[]>`
        INSERT INTO templates (key, name, channel, format, status, folder, list_id, subject, preview_text, html_content, text_content, variables_schema)
        VALUES (${input.key}, ${input.name}, ${input.channel}, ${input.format}, ${input.publish ? "published" : "draft"}, ${input.folder}, ${input.list_id ?? null},
          ${input.subject}, ${input.preview_text}, ${input.html}, ${input.text}, ${tx.json(storedVariables)}) RETURNING id
      `;
      const [version] = await tx<{ id: string; version_number: number }[]>`
        INSERT INTO template_versions (template_id, version_number, status, source_format, subject, preview_text, html_content, text_content, visual_document, variables_schema, created_by, change_note, published_at)
        VALUES (${template.id}, 1, ${input.publish ? "published" : "draft"}, ${input.format}, ${input.subject}, ${input.preview_text}, ${input.html}, ${input.text},
          ${storedDocument ? tx.json(storedDocument) : null}, ${tx.json(storedVariables)}, ${principal.kind === "session" ? principal.id : null}, 'Versión inicial', ${input.publish ? new Date() : null}) RETURNING id, version_number
      `;
      for(const usage of collectAssetUsages(input.visual_document))await tx`INSERT INTO asset_usages(asset_id,template_version_id,block_id)SELECT id,${version.id},${usage.blockId} FROM assets WHERE id=${usage.assetId} ON CONFLICT DO NOTHING`;
      if (input.publish) await tx`UPDATE templates SET published_version_id=${version.id} WHERE id=${template.id}`;
      await tx`INSERT INTO audit_log (action, entity_type, entity_id, api_key_id, detail)
        VALUES ('create', 'template', ${template.id}, ${principal.kind === "api_key" ? principal.id : null}, ${tx.json({ key: input.key, channel: input.channel, published: input.publish })})`;
      const[current]=await tx<{id:string;revision:number;[key:string]:unknown}[]>`SELECT * FROM templates WHERE id=${template.id}`;
      return { ...current, version_id: version.id, version_number: version.version_number, diagnostics };
    });
    return versionedJson(request,result,"template",result.id,result.revision,201);
  } catch (error) {
    if ((error as { code?: string }).code === "23505") return NextResponse.json({ error: { code: "key_conflict", message: "La clave de plantilla ya existe" } }, { status: 409 });
    if (error instanceof z.ZodError) return NextResponse.json({ error: { code: "validation_error", message: "Datos no válidos", issues: error.issues } }, { status: 422 });
    console.error(error); return NextResponse.json({ error: { code: "internal_error", message: "No se pudo crear la plantilla" } }, { status: 500 });
  }
}
