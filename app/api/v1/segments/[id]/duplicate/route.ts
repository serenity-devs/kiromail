import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateApiRequest } from "@/lib/api-auth";
import { sql } from "@/lib/db";

const schema=z.object({name:z.string().trim().min(1).max(200).optional()});

export async function POST(request:Request,context:{params:Promise<{id:string}>}){
  const principal=await authenticateApiRequest(request,"lists:write");
  if(!principal)return NextResponse.json({error:{code:"unauthorized",message:"No autorizado"}},{status:401});
  try{
    const{id}=await context.params;const input=schema.parse(await request.json().catch(()=>({})));
    const result=await sql.begin(async tx=>{
      const[source]=await tx<{id:string;name:string}[]>`SELECT id,name FROM segments WHERE id=${id} FOR UPDATE`;
      if(!source)return null;
      const[created]=await tx`
        INSERT INTO segments(name,description,list_id,status,match_type,rules,definition,last_count,last_count_at,duplicated_from_id)
        SELECT ${input.name??`${source.name} · copia`},description,list_id,'active',match_type,rules,definition,last_count,now(),id FROM segments WHERE id=${source.id} RETURNING *
      `;
      await tx`INSERT INTO segment_count_history(segment_id,captured_on,contact_count) VALUES(${created.id},CURRENT_DATE,${created.last_count??0})`;
      await tx`INSERT INTO audit_log(action,entity_type,entity_id,user_id,api_key_id,detail) VALUES('duplicate','segment',${created.id},${principal.kind==="session"?principal.id:null},${principal.kind==="api_key"?principal.id:null},${tx.json({source_segment_id:source.id})})`;
      return created;
    });
    if(!result)return NextResponse.json({error:{code:"not_found",message:"Segmento no encontrado"}},{status:404});
    return NextResponse.json(result,{status:201});
  }catch(error){if(error instanceof z.ZodError)return NextResponse.json({error:{code:"validation_error",message:"Datos no válidos",issues:error.issues}},{status:422});console.error(error);return NextResponse.json({error:{code:"duplicate_failed",message:"No se pudo duplicar el segmento"}},{status:500});}
}
