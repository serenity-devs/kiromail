import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateApiRequest } from "@/lib/api-auth";
import { sql } from "@/lib/db";
import { versionedItems, versionedJson } from "@/lib/http-concurrency";

const fieldSchema = z.object({
  key: z.string().trim().regex(/^[a-z][a-z0-9_]{0,79}$/), label: z.string().trim().min(1).max(120),
  type: z.enum(["text", "textarea", "integer", "decimal", "date", "datetime", "boolean", "select", "multiselect", "email", "url"]),
  help_text: z.string().max(500).default(""), required: z.boolean().default(false), default_value: z.unknown().optional(),
  options: z.array(z.union([z.string(), z.number()])).max(200).default([]), validation: z.record(z.string(), z.unknown()).default({}),
  visibility: z.enum(["private", "preference_center"]).default("private"), position: z.number().int().min(0).optional(),
});

const schema = z.object({
  key: z.string().trim().regex(/^[a-z][a-z0-9_\-]{1,159}$/).optional(), name: z.string().trim().min(1).max(200),
  description: z.string().max(1000).default(""), color: z.string().regex(/^#[0-9a-f]{6}$/i).default("#315c5b"),
  default_from_name: z.string().max(200).default(""), default_from_email: z.union([z.email(), z.literal("")]).default(""),
  default_reply_to: z.union([z.email(), z.literal("")]).default(""), language: z.string().max(12).default("es"), legal_footer: z.string().max(5000).default(""),
  public_signup_enabled: z.boolean().default(false), double_opt_in: z.boolean().default(true), preference_center_visible: z.boolean().default(true), consent_text_default: z.string().max(5000).default(""),
  fields: z.array(fieldSchema).max(100).default([]),
});

function generatedKey(name: string) {
  const base = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 120) || "lista";
  return `${base}_${randomBytes(3).toString("hex")}`;
}

export async function GET(request: Request) {
  const principal = await authenticateApiRequest(request, "lists:read");
  if (!principal) return NextResponse.json({ error: { code: "unauthorized", message: "No autorizado" } }, { status: 401 });
  const includeArchived = new URL(request.url).searchParams.get("include_archived") === "true";
  const lists = await sql`
    SELECT l.*, count(s.id) FILTER (WHERE s.status='active')::int AS active_subscriptions,
      count(s.id) FILTER (WHERE s.status='unsubscribed')::int AS unsubscribed,
      (SELECT count(*)::int FROM list_fields f WHERE f.list_id=l.id AND f.status='active') AS field_count
    FROM lists l LEFT JOIN subscriptions s ON s.list_id=l.id
    WHERE (${includeArchived} OR l.status='active') GROUP BY l.id ORDER BY l.created_at DESC
  `;
  return NextResponse.json({ data: versionedItems(lists as unknown as {id:string;revision:number}[], "list") });
}

export async function POST(request: Request) {
  const principal = await authenticateApiRequest(request, "lists:write");
  if (!principal) return NextResponse.json({ error: { code: "unauthorized", message: "No autorizado" } }, { status: 401 });
  try {
    const input = schema.parse(await request.json());
    const key = input.key ?? generatedKey(input.name);
    const result = await sql.begin(async (tx) => {
      const [list] = await tx<{ id: string; revision:number; [key:string]:unknown }[]>`
        INSERT INTO lists (key,name,description,color,default_from_name,default_from_email,default_reply_to,language,legal_footer,public_signup_enabled,double_opt_in,preference_center_visible,consent_text_default)
        VALUES (${key},${input.name},${input.description},${input.color},${input.default_from_name},${input.default_from_email},${input.default_reply_to},${input.language},${input.legal_footer},${input.public_signup_enabled},${input.double_opt_in},${input.preference_center_visible},${input.consent_text_default}) RETURNING *
      `;
      for (const [index, field] of input.fields.entries()) {
        const storedOptions = JSON.parse(JSON.stringify(field.options)) as never;
        const storedValidation = JSON.parse(JSON.stringify(field.validation)) as never;
        const storedDefault = field.default_value === undefined ? null : JSON.parse(JSON.stringify(field.default_value)) as never;
        await tx`
          INSERT INTO list_fields (list_id,key,label,type,help_text,required,default_value,options,validation,visibility,position)
          VALUES (${list.id},${field.key},${field.label},${field.type},${field.help_text},${field.required},${storedDefault === null ? null : tx.json(storedDefault)},${tx.json(storedOptions)},${tx.json(storedValidation)},${field.visibility},${field.position ?? index})
        `;
      }
      await tx`INSERT INTO audit_log (action,entity_type,entity_id,api_key_id,detail) VALUES ('create','list',${list.id},${principal.kind === "api_key" ? principal.id : null},${tx.json({ key, fields: input.fields.length })})`;
      return { ...list, fields: input.fields };
    });
    return versionedJson(request, result, "list", result.id, result.revision, 201);
  } catch (error) {
    if ((error as { code?: string }).code === "23505") return NextResponse.json({ error: { code: "key_conflict", message: "La clave de lista o de campo ya existe" } }, { status: 409 });
    if (error instanceof z.ZodError) return NextResponse.json({ error: { code: "validation_error", message: "Datos no válidos", issues: error.issues } }, { status: 422 });
    console.error(error); return NextResponse.json({ error: { code: "internal_error", message: "No se pudo crear la lista" } }, { status: 500 });
  }
}

export { fieldSchema };
