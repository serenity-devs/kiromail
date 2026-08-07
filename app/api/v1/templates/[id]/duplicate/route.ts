import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateApiRequest } from "@/lib/api-auth";
import { sql } from "@/lib/db";
import { templateDiagnostics } from "@/lib/template-service";

const schema=z.object({name:z.string().trim().min(1).max(200).optional(),key:z.string().trim().regex(/^[a-z][a-z0-9_\-]{1,159}$/).optional()});

export async function POST(request:Request,context:{params:Promise<{id:string}>}){
  const principal=await authenticateApiRequest(request,"templates:write");
  if(!principal)return NextResponse.json({error:{code:"unauthorized",message:"No autorizado"}},{status:401});
  try{
    const{id}=await context.params;const input=schema.parse(await request.json().catch(()=>({})));
    const result=await sql.begin(async tx=>{
      const[source]=await tx<{id:string;key:string;name:string;channel:string;format:string;folder:string;list_id:string|null}[]>`SELECT id,key,name,channel,format,folder,list_id FROM templates WHERE id=${id} FOR UPDATE`;
      if(!source)return null;
      const[version]=await tx`SELECT * FROM template_versions WHERE template_id=${source.id} ORDER BY version_number DESC LIMIT 1`;
      if(!version)return null;
      const key=input.key??`${source.key.slice(0,145)}_${randomBytes(4).toString("hex")}`;
      const[created]=await tx<{id:string}[]>`INSERT INTO templates(key,name,channel,format,status,folder,list_id,subject,preview_text,html_content,text_content,variables_schema,duplicated_from_id)
        VALUES(${key},${input.name??`${source.name} · copia`},${source.channel},${source.format},'draft',${source.folder},${source.list_id},${version.subject},${version.preview_text},${version.html_content},${version.text_content},${tx.json(version.variables_schema as never)},${source.id}) RETURNING id`;
      const[copiedVersion]=await tx`INSERT INTO template_versions(template_id,version_number,status,source_format,subject,preview_text,html_content,text_content,visual_document,variables_schema,created_by,change_note)
        VALUES(${created.id},1,'draft',${version.source_format},${version.subject},${version.preview_text},${version.html_content},${version.text_content},${version.visual_document?tx.json(version.visual_document as never):null},${tx.json(version.variables_schema as never)},${principal.kind==="session"?principal.id:null},${`Copia de ${source.name}`}) RETURNING *`;
      await tx`INSERT INTO asset_usages(asset_id,template_version_id,block_id)SELECT asset_id,${copiedVersion.id},block_id FROM asset_usages WHERE template_version_id=${version.id} ON CONFLICT DO NOTHING`;
      await tx`INSERT INTO audit_log(action,entity_type,entity_id,user_id,api_key_id,detail)VALUES('duplicate','template',${created.id},${principal.kind==="session"?principal.id:null},${principal.kind==="api_key"?principal.id:null},${tx.json({source_template_id:source.id,source_version_id:version.id})})`;
      return{...copiedVersion,id:created.id,version_id:copiedVersion.id,key,name:input.name??`${source.name} · copia`,channel:source.channel,format:source.format,status:"draft",folder:source.folder,list_id:source.list_id,duplicated_from_id:source.id,diagnostics:templateDiagnostics(copiedVersion as never)};
    });
    if(!result)return NextResponse.json({error:{code:"not_found",message:"Plantilla o versión no encontrada"}},{status:404});
    return NextResponse.json(result,{status:201});
  }catch(error){
    if((error as{code?:string}).code==="23505")return NextResponse.json({error:{code:"key_conflict",message:"La clave de la copia ya existe"}},{status:409});
    if(error instanceof z.ZodError)return NextResponse.json({error:{code:"validation_error",message:"Datos no válidos",issues:error.issues}},{status:422});
    console.error(error);return NextResponse.json({error:{code:"duplicate_failed",message:"No se pudo duplicar la plantilla"}},{status:500});
  }
}
