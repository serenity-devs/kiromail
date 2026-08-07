import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateApiRequest } from "@/lib/api-auth";
import { sql } from "@/lib/db";
import { preconditionResponse, requireIfMatch, staleResourceResponse, versionedJson } from "@/lib/http-concurrency";

const schema = z.object({
  label: z.string().trim().min(1).max(120).optional(), help_text: z.string().max(500).optional(), required: z.boolean().optional(),
  options: z.array(z.union([z.string(),z.number()])).max(200).optional(), validation: z.record(z.string(),z.unknown()).optional(),
  visibility: z.enum(["private","preference_center"]).optional(), position: z.number().int().min(0).optional(),
  status: z.enum(["active","archived"]).optional(),
}).refine((value) => Object.keys(value).length > 0);

export async function GET(request:Request,context:{params:Promise<{id:string;fieldId:string}>}){
  const principal=await authenticateApiRequest(request,"lists:read");if(!principal)return NextResponse.json({error:{code:"unauthorized",message:"No autorizado"}},{status:401});
  const{id,fieldId}=await context.params;const[field]=await sql`SELECT * FROM list_fields WHERE id=${fieldId} AND list_id=${id}`;
  if(!field)return NextResponse.json({error:{code:"not_found",message:"Campo no encontrado"}},{status:404});return versionedJson(request,field,"list-field",`${id}/${fieldId}`,field.revision);
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string; fieldId: string }> }) {
  const principal = await authenticateApiRequest(request, "lists:write");
  if (!principal) return NextResponse.json({ error: { code: "unauthorized", message: "No autorizado" } }, { status: 401 });
  try {
    const { id,fieldId } = await context.params; const revision=requireIfMatch(request,"list-field",`${id}/${fieldId}`);const input = schema.parse(await request.json());
    const options = input.options === undefined ? null : JSON.parse(JSON.stringify(input.options)) as never;
    const validation = input.validation === undefined ? null : JSON.parse(JSON.stringify(input.validation)) as never;
    const [field] = await sql.begin(async tx=>{const [updated]=await tx`
      UPDATE list_fields SET label=COALESCE(${input.label ?? null},label),help_text=COALESCE(${input.help_text ?? null},help_text),
        required=COALESCE(${input.required ?? null},required),options=COALESCE(${options ? sql.json(options) : null},options),
        validation=COALESCE(${validation ? sql.json(validation) : null},validation),visibility=COALESCE(${input.visibility ?? null},visibility),
        position=COALESCE(${input.position ?? null},position),status=COALESCE(${input.status ?? null},status),
        archived_at=CASE WHEN ${input.status ?? null}='active' THEN NULL WHEN ${input.status ?? null}='archived' THEN COALESCE(archived_at,now()) ELSE archived_at END,updated_at=now()
      WHERE id=${fieldId} AND list_id=${id} AND revision=${revision} RETURNING *
    `;if(updated)await tx`INSERT INTO audit_log(action,entity_type,entity_id,user_id,api_key_id,detail)VALUES(${input.status==="active"?"restore":input.status==="archived"?"archive":"update"},'list_field',${fieldId},${principal.kind==="session"?principal.id:null},${principal.kind==="api_key"?principal.id:null},${tx.json({list_id:id,status:input.status??updated.status})})`;return[updated];});
    if (!field) return staleResourceResponse();
    return versionedJson(request,field,"list-field",`${id}/${fieldId}`,field.revision);
  } catch (error) {const precondition=preconditionResponse(error);if(precondition)return precondition;return NextResponse.json({ error: { code: "validation_error", message: error instanceof Error ? error.message : "Datos no válidos" } }, { status: 422 }); }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string; fieldId: string }> }) {
  const principal = await authenticateApiRequest(request, "lists:write");
  if (!principal) return NextResponse.json({ error: { code: "unauthorized", message: "No autorizado" } }, { status: 401 });
  try{const { id,fieldId } = await context.params;const revision=requireIfMatch(request,"list-field",`${id}/${fieldId}`);
  const [field] = await sql`UPDATE list_fields SET status='archived',archived_at=now(),updated_at=now() WHERE id=${fieldId} AND list_id=${id} AND revision=${revision} AND status='active' RETURNING id,revision`;
  if (!field) return staleResourceResponse();
  return versionedJson(request,{ archived: true },"list-field",`${id}/${fieldId}`,field.revision);}catch(error){const precondition=preconditionResponse(error);if(precondition)return precondition;throw error;}
}
