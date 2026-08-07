import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateApiRequest } from "@/lib/api-auth";
import { sql } from "@/lib/db";

const schema=z.object({name:z.string().trim().min(1).max(200).optional()});

export async function POST(request:Request,context:{params:Promise<{id:string}>}){
  const principal=await authenticateApiRequest(request,"campaigns:write");if(!principal)return NextResponse.json({error:{code:"unauthorized",message:"No autorizado"}},{status:401});
  try{
    const{id}=await context.params;const input=schema.parse(await request.json().catch(()=>({})));const[source]=await sql<{name:string}[]>`SELECT name FROM campaigns WHERE id=${id} AND archived_at IS NULL`;
    if(!source)return NextResponse.json({error:{code:"not_found",message:"Campaña no encontrada"}},{status:404});
    const[row]=await sql`INSERT INTO campaigns(name,subject,preview_text,from_name,from_email,reply_to,template_id,target_type,target_id,status,list_id,template_version_id,content_source,html_content,text_content,content_snapshot,exclusion_segment_ids,track_opens,track_clicks,approval_required,duplicated_from_id)
      SELECT ${input.name??`${source.name} · copia`},subject,preview_text,from_name,from_email,reply_to,template_id,target_type,target_id,'draft',list_id,template_version_id,content_source,html_content,text_content,content_snapshot,exclusion_segment_ids,track_opens,track_clicks,approval_required,id FROM campaigns WHERE id=${id} RETURNING *`;
    await sql`INSERT INTO audit_log(action,entity_type,entity_id,user_id,api_key_id,detail)VALUES('duplicate','campaign',${row.id},${principal.kind==="session"?principal.id:null},${principal.kind==="api_key"?principal.id:null},${sql.json({duplicated_from_id:id})})`;
    return NextResponse.json(row,{status:201});
  }catch(error){if(error instanceof z.ZodError)return NextResponse.json({error:{code:"validation_error",message:"Datos no válidos",issues:error.issues}},{status:422});console.error(error);return NextResponse.json({error:{code:"duplicate_failed",message:"No se pudo duplicar la campaña"}},{status:422});}
}
