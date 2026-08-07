import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateApiRequest } from "@/lib/api-auth";
import { sql } from "@/lib/db";

const schema=z.object({name:z.string().trim().min(1).max(200).optional(),key:z.string().trim().regex(/^[a-z][a-z0-9_\-]{1,159}$/).optional()});

export async function POST(request:Request,context:{params:Promise<{id:string}>}){
  const principal=await authenticateApiRequest(request,"lists:write");
  if(!principal)return NextResponse.json({error:{code:"unauthorized",message:"No autorizado"}},{status:401});
  try{
    const{id}=await context.params;const input=schema.parse(await request.json().catch(()=>({})));
    const result=await sql.begin(async tx=>{
      const[source]=await tx<{id:string;name:string;key:string}[]>`SELECT id,name,key FROM lists WHERE id=${id} FOR UPDATE`;
      if(!source)return null;
      const name=input.name??`${source.name} · copia`;const key=input.key??`${source.key.slice(0,145)}_${randomBytes(4).toString("hex")}`;
      const[created]=await tx<{id:string}[]>`
        INSERT INTO lists(key,name,description,color,status,default_from_name,default_from_email,default_reply_to,language,legal_footer,public_signup_enabled,double_opt_in,preference_center_visible,consent_text_default,duplicated_from_id)
        SELECT ${key},${name},description,color,'active',default_from_name,default_from_email,default_reply_to,language,legal_footer,false,double_opt_in,preference_center_visible,consent_text_default,id
        FROM lists WHERE id=${source.id} RETURNING id
      `;
      await tx`INSERT INTO list_fields(list_id,key,label,type,help_text,required,default_value,options,validation,visibility,position,status)
        SELECT ${created.id},key,label,type,help_text,required,default_value,options,validation,visibility,position,'active' FROM list_fields WHERE list_id=${source.id} AND status='active'`;
      await tx`INSERT INTO audit_log(action,entity_type,entity_id,user_id,api_key_id,detail) VALUES('duplicate','list',${created.id},${principal.kind==="session"?principal.id:null},${principal.kind==="api_key"?principal.id:null},${tx.json({source_list_id:source.id,subscribers_copied:false})})`;
      const[detail]=await tx`SELECT l.*,(SELECT count(*)::int FROM list_fields f WHERE f.list_id=l.id) AS field_count,0::int AS active_subscriptions FROM lists l WHERE l.id=${created.id}`;
      return detail;
    });
    if(!result)return NextResponse.json({error:{code:"not_found",message:"Lista no encontrada"}},{status:404});
    return NextResponse.json(result,{status:201});
  }catch(error){
    if((error as{code?:string}).code==="23505")return NextResponse.json({error:{code:"key_conflict",message:"La clave de la lista duplicada ya existe"}},{status:409});
    if(error instanceof z.ZodError)return NextResponse.json({error:{code:"validation_error",message:"Datos no válidos",issues:error.issues}},{status:422});
    console.error(error);return NextResponse.json({error:{code:"duplicate_failed",message:"No se pudo duplicar la lista"}},{status:500});
  }
}
