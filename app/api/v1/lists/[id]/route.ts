import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateApiRequest } from "@/lib/api-auth";
import { sql } from "@/lib/db";
import { preconditionResponse, requireIfMatch, resourceEtag, staleResourceResponse, versionedJson } from "@/lib/http-concurrency";
import { importUsesListField, segmentUsesListField, templateUsesListField } from "@/lib/list-field-dependencies";
import { normalizeSubscriberTableColumns, subscriberTableColumnIds } from "@/lib/list-table-columns";

const schema = z.object({
  name: z.string().trim().min(1).max(200).optional(), description: z.string().max(1000).optional(),
  color: z.string().regex(/^#[0-9a-f]{6}$/i).optional(), default_from_name: z.string().max(200).optional(),
  default_from_email: z.union([z.email(), z.literal("")]).optional(), default_reply_to: z.union([z.email(), z.literal("")]).optional(),
  language: z.string().max(12).optional(), legal_footer: z.string().max(5000).optional(),
  public_signup_enabled: z.boolean().optional(), double_opt_in: z.boolean().optional(), preference_center_visible: z.boolean().optional(), consent_text_default: z.string().max(5000).optional(),
  subscriber_table_columns: z.array(z.enum(subscriberTableColumnIds)).max(subscriberTableColumnIds.length).transform(normalizeSubscriberTableColumns).optional(),
  status: z.enum(["active","archived"]).optional(),
}).refine((value) => Object.keys(value).length > 0);

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const principal = await authenticateApiRequest(request, "lists:read");
  if (!principal) return NextResponse.json({ error: { code: "unauthorized", message: "No autorizado" } }, { status: 401 });
  const { id } = await context.params;
  const [list] = await sql`SELECT * FROM lists WHERE id=${id}`;
  if (!list) return NextResponse.json({ error: { code: "not_found", message: "Lista no encontrada" } }, { status: 404 });
  const fields = await sql<{id:string;revision:number;[key:string]:unknown}[]>`SELECT * FROM list_fields WHERE list_id=${id} ORDER BY status,position,created_at`;
  const segments = await sql<{id:string;name:string;status:string;definition:unknown}[]>`SELECT id,name,status,definition FROM segments WHERE list_id=${id}`;
  const imports = await sql<{input:unknown}[]>`SELECT input FROM background_jobs WHERE type='contacts_import' AND input->>'list_id'=${id}`;
  const templates = await sql<{id:string;name:string;content:string}[]>`
    SELECT t.id,t.name,concat_ws(E'\n',v.subject,v.preview_text,v.html_content,v.text_content) AS content
    FROM templates t
    JOIN LATERAL (
      SELECT subject,preview_text,html_content,text_content FROM template_versions
      WHERE template_id=t.id ORDER BY version_number DESC LIMIT 1
    ) v ON true
    WHERE t.list_id=${id} AND t.status<>'archived'
  `;
  const [stats] = await sql`SELECT count(*) FILTER (WHERE status='active')::int AS active, count(*) FILTER (WHERE status='unsubscribed')::int AS unsubscribed, count(*)::int AS total FROM subscriptions WHERE list_id=${id}`;
  return versionedJson(request, { ...list, fields:fields.map(field=>{const key=String(field.key);return {...field,etag:resourceEtag("list-field",`${id}/${field.id}`,field.revision),dependencies:{segments:segments.filter(segment=>segmentUsesListField(segment.definition,key)).map(({id:segmentId,name,status})=>({id:segmentId,name,status})),import_jobs:imports.filter(job=>importUsesListField(job.input,id,key)).length,templates:templates.filter(template=>templateUsesListField(template.content,key)).map(({id:templateId,name})=>({id:templateId,name}))}}}), stats }, "list", id, list.revision, 200, { cache: "no-store" });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const principal = await authenticateApiRequest(request, "lists:write");
  if (!principal) return NextResponse.json({ error: { code: "unauthorized", message: "No autorizado" } }, { status: 401 });
  try {
    const { id } = await context.params; const revision=requireIfMatch(request,"list",id);const input = schema.parse(await request.json());
    const [list] = await sql.begin(async tx=>{
      const [updated] = await tx`
      UPDATE lists SET name=COALESCE(${input.name ?? null},name), description=COALESCE(${input.description ?? null},description),
        color=COALESCE(${input.color ?? null},color), default_from_name=COALESCE(${input.default_from_name ?? null},default_from_name),
        default_from_email=COALESCE(${input.default_from_email ?? null},default_from_email), default_reply_to=COALESCE(${input.default_reply_to ?? null},default_reply_to),
        language=COALESCE(${input.language ?? null},language), legal_footer=COALESCE(${input.legal_footer ?? null},legal_footer),
        public_signup_enabled=COALESCE(${input.public_signup_enabled ?? null},public_signup_enabled),double_opt_in=COALESCE(${input.double_opt_in ?? null},double_opt_in),
        preference_center_visible=COALESCE(${input.preference_center_visible ?? null},preference_center_visible),consent_text_default=COALESCE(${input.consent_text_default ?? null},consent_text_default),
        subscriber_table_columns=CASE WHEN ${input.subscriber_table_columns !== undefined} THEN ${input.subscriber_table_columns ?? []} ELSE subscriber_table_columns END,
        status=COALESCE(${input.status ?? null},status),archived_at=CASE WHEN ${input.status ?? null}='active' THEN NULL WHEN ${input.status ?? null}='archived' THEN COALESCE(archived_at,now()) ELSE archived_at END,updated_at=now()
      WHERE id=${id} AND revision=${revision} RETURNING *
      `;
      if(updated)await tx`INSERT INTO audit_log(action,entity_type,entity_id,user_id,api_key_id,detail)VALUES(${input.status==="active"?"restore":input.status==="archived"?"archive":"update"},'list',${id},${principal.kind==="session"?principal.id:null},${principal.kind==="api_key"?principal.id:null},${tx.json({status:input.status??updated.status})})`;
      return[updated];
    });
    if (!list) return staleResourceResponse();
    return versionedJson(request,list,"list",id,list.revision);
  } catch (error) {
    const precondition=preconditionResponse(error);if(precondition)return precondition;
    if (error instanceof z.ZodError) return NextResponse.json({ error: { code: "validation_error", message: "Datos no válidos", issues: error.issues } }, { status: 422 });
    throw error;
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const principal = await authenticateApiRequest(request, "lists:write");
  if (!principal) return NextResponse.json({ error: { code: "unauthorized", message: "No autorizado" } }, { status: 401 });
  try{const { id } = await context.params;const revision=requireIfMatch(request,"list",id);
  const [list] = await sql`UPDATE lists SET status='archived',archived_at=now(),updated_at=now() WHERE id=${id} AND revision=${revision} AND status='active' RETURNING id,revision`;
  if (!list) return staleResourceResponse();
  return versionedJson(request,{ archived: true },"list",id,list.revision);}catch(error){const precondition=preconditionResponse(error);if(precondition)return precondition;throw error;}
}
