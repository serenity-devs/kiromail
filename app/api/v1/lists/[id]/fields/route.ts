import { NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/api-auth";
import { sql } from "@/lib/db";
import { fieldSchema } from "../../route";
import { resourceEtag, versionedJson } from "@/lib/http-concurrency";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const principal = await authenticateApiRequest(request, "lists:read");
  if (!principal) return NextResponse.json({ error: { code: "unauthorized", message: "No autorizado" } }, { status: 401 });
  const { id } = await context.params;
  const data=await sql<{id:string;revision:number;[key:string]:unknown}[]>`SELECT * FROM list_fields WHERE list_id=${id} ORDER BY status,position,created_at`;
  return NextResponse.json({ data:data.map(field=>({...field,etag:resourceEtag("list-field",`${id}/${field.id}`,field.revision)})) });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const principal = await authenticateApiRequest(request, "lists:write");
  if (!principal) return NextResponse.json({ error: { code: "unauthorized", message: "No autorizado" } }, { status: 401 });
  try {
    const { id } = await context.params; const input = fieldSchema.parse(await request.json());
    const [list] = await sql<{ id: string }[]>`SELECT id FROM lists WHERE id=${id} AND status='active'`;
    if (!list) return NextResponse.json({ error: { code: "not_found", message: "Lista no encontrada" } }, { status: 404 });
    const storedOptions = JSON.parse(JSON.stringify(input.options)) as never;
    const storedValidation = JSON.parse(JSON.stringify(input.validation)) as never;
    const storedDefault = input.default_value === undefined ? null : JSON.parse(JSON.stringify(input.default_value)) as never;
    const [field] = await sql`
      INSERT INTO list_fields (list_id,key,label,type,help_text,required,default_value,options,validation,visibility,position)
      VALUES (${id},${input.key},${input.label},${input.type},${input.help_text},${input.required},${storedDefault === null ? null : sql.json(storedDefault)},${sql.json(storedOptions)},${sql.json(storedValidation)},${input.visibility},
        ${input.position ?? 999}) RETURNING *
    `;
    return versionedJson(request,field,"list-field",`${id}/${field.id}`,field.revision,201);
  } catch (error) {
    if ((error as { code?: string }).code === "23505") return NextResponse.json({ error: { code: "key_conflict", message: "La clave de campo ya existe" } }, { status: 409 });
    return NextResponse.json({ error: { code: "validation_error", message: error instanceof Error ? error.message : "Datos no válidos" } }, { status: 422 });
  }
}
