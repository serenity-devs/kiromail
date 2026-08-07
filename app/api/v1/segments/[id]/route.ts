import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateApiRequest } from "@/lib/api-auth";
import { sql } from "@/lib/db";
import { preconditionResponse, requireIfMatch, staleResourceResponse, versionedJson } from "@/lib/http-concurrency";
import { flattenSegmentRules,previewSegment,segmentInputSchema,validateSegmentDefinition } from "@/lib/segment-service";

export async function GET(request:Request,context:{params:Promise<{id:string}>}){
  const principal=await authenticateApiRequest(request,"lists:read");if(!principal)return NextResponse.json({error:{code:"unauthorized",message:"No autorizado"}},{status:401});
  const{id}=await context.params;const[segment]=await sql`SELECT s.*,l.name AS list_name,(SELECT json_agg(h ORDER BY h.captured_on DESC)FROM(SELECT captured_on,contact_count FROM segment_count_history WHERE segment_id=s.id ORDER BY captured_on DESC LIMIT 30)h)AS count_history FROM segments s LEFT JOIN lists l ON l.id=s.list_id WHERE s.id=${id}`;
  if(!segment)return NextResponse.json({error:{code:"not_found",message:"Segmento no encontrado"}},{status:404});return versionedJson(request,segment,"segment",id,segment.revision);
}

export async function PATCH(request:Request,context:{params:Promise<{id:string}>}){
  const principal=await authenticateApiRequest(request,"lists:write");if(!principal)return NextResponse.json({error:{code:"unauthorized",message:"No autorizado"}},{status:401});
  try{
    const{id}=await context.params;const revision=requireIfMatch(request,"segment",id);const raw=await request.json();
    if(raw.status){
      const input=z.object({status:z.enum(["active","archived"])}).parse(raw);
      const[segment]=await sql.begin(async tx=>{const[updated]=await tx`UPDATE segments SET status=${input.status},archived_at=CASE WHEN ${input.status}='archived' THEN COALESCE(archived_at,now()) ELSE NULL END,updated_at=now() WHERE id=${id} AND revision=${revision} RETURNING *`;if(updated)await tx`INSERT INTO audit_log(action,entity_type,entity_id,user_id,api_key_id,detail)VALUES(${input.status==="active"?"restore":"archive"},'segment',${id},${principal.kind==="session"?principal.id:null},${principal.kind==="api_key"?principal.id:null},${tx.json({status:input.status})})`;return[updated];});
      if(!segment)return staleResourceResponse();return versionedJson(request,segment,"segment",id,segment.revision);
    }
    const input=segmentInputSchema.parse(raw);const definition=await validateSegmentDefinition(input.list_id,input.definition);const preview=await previewSegment(input.list_id,definition);const stored=JSON.parse(JSON.stringify(definition)) as never;const rules=JSON.parse(JSON.stringify(flattenSegmentRules(definition))) as never;
    const[segment]=await sql.begin(async tx=>{const[updated]=await tx`UPDATE segments SET name=${input.name},description=${input.description},list_id=${input.list_id},match_type=${definition.match},rules=${tx.json(rules)},definition=${tx.json(stored)},last_count=${preview.count},last_count_at=now(),updated_at=now() WHERE id=${id} AND revision=${revision} RETURNING *`;if(updated){await tx`INSERT INTO segment_count_history(segment_id,contact_count)VALUES(${id},${preview.count})ON CONFLICT(segment_id,captured_on)DO UPDATE SET contact_count=EXCLUDED.contact_count,created_at=now()`;await tx`INSERT INTO audit_log(action,entity_type,entity_id,user_id,api_key_id,detail)VALUES('update','segment',${id},${principal.kind==="session"?principal.id:null},${principal.kind==="api_key"?principal.id:null},${tx.json({count:preview.count})})`;}return[updated];});
    if(!segment)return staleResourceResponse();return versionedJson(request,{...segment,preview},"segment",id,segment.revision);
  }catch(error){const precondition=preconditionResponse(error);if(precondition)return precondition;return NextResponse.json({error:{code:"validation_error",message:error instanceof Error?error.message:"Segmento no válido"}},{status:422});}
}

export async function DELETE(request:Request,context:{params:Promise<{id:string}>}){
  const principal=await authenticateApiRequest(request,"lists:write");if(!principal)return NextResponse.json({error:{code:"unauthorized",message:"No autorizado"}},{status:401});
  try{const{id}=await context.params;const revision=requireIfMatch(request,"segment",id);const[segment]=await sql`UPDATE segments SET status='archived',archived_at=now(),updated_at=now() WHERE id=${id} AND revision=${revision} AND status='active' RETURNING id,revision`;if(!segment)return staleResourceResponse();return versionedJson(request,{archived:true},"segment",id,segment.revision);}catch(error){const precondition=preconditionResponse(error);if(precondition)return precondition;throw error;}
}
