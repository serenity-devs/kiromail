import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateApiRequest } from "@/lib/api-auth";
import { estimateCampaignAudience,startCampaign } from "@/lib/campaign-service";
import { sql } from "@/lib/db";
import { assertSendingAvailable } from "@/lib/deliverability";

const schema=z.object({confirm_recipient_count:z.number().int().min(0)});
export async function POST(request:Request,context:{params:Promise<{id:string}>}){
  const principal=await authenticateApiRequest(request,"campaigns:send");if(!principal)return NextResponse.json({error:{code:"unauthorized",message:"No autorizado"}},{status:401});
  try{const {id}=await context.params;const input=schema.parse(await request.json());const key=request.headers.get("idempotency-key")?.trim();if(!key)return NextResponse.json({error:{code:"idempotency_required",message:"Falta Idempotency-Key"}},{status:400});
    const scope=`campaign:${principal.id}`;const [existing]=await sql<{status:string;launch_idempotency_scope:string|null;launch_idempotency_key:string|null;total_recipients:number;approval_required:boolean;approved_at:Date|null;approved_version:number|null;version:number;from_email:string}[]>`SELECT status,launch_idempotency_scope,launch_idempotency_key,total_recipients,approval_required,approved_at,approved_version,version,from_email FROM campaigns WHERE id=${id}`;
    if(!existing)return NextResponse.json({error:{code:"not_found",message:"Campaña no encontrada"}},{status:404});if(existing.launch_idempotency_scope===scope&&existing.launch_idempotency_key===key)return NextResponse.json({id,status:existing.status,recipients:existing.total_recipients,duplicate:true},{status:202});await assertSendingAvailable(existing.from_email);
    if(existing.launch_idempotency_key)return NextResponse.json({error:{code:"already_launched",message:"La campaña ya se lanzó con otra clave"}},{status:409});if(existing.approval_required&&(!existing.approved_at||existing.approved_version!==existing.version))return NextResponse.json({error:{code:"approval_required",message:"La versión actual necesita aprobación antes de enviarse"}},{status:409});const audience=await estimateCampaignAudience(id);if(audience.included!==input.confirm_recipient_count)return NextResponse.json({error:{code:"audience_changed",message:"La audiencia ha cambiado; confirma el nuevo total",expected:audience.included}},{status:409});if(audience.included===0)return NextResponse.json({error:{code:"empty_audience",message:"No hay destinatarios enviables"}},{status:422});
    const [claimed]=await sql`UPDATE campaigns SET launch_idempotency_scope=${scope},launch_idempotency_key=${key},updated_at=now() WHERE id=${id} AND status IN('draft','scheduled','paused') AND launch_idempotency_key IS NULL AND (approval_required=false OR (approved_at IS NOT NULL AND approved_version=version)) RETURNING id`;
    if(!claimed)return NextResponse.json({error:{code:"invalid_state",message:"La campaña no se puede lanzar"}},{status:409});const result=await startCampaign(id,{action:"launch",actor:{id:principal.id,kind:principal.kind}});return NextResponse.json({id,status:"sending",recipients:result.recipients,duplicate:false},{status:202});
  }catch(error){if(error instanceof z.ZodError)return NextResponse.json({error:{code:"validation_error",message:"Datos no válidos",issues:error.issues}},{status:422});console.error(error);return NextResponse.json({error:{code:"launch_failed",message:error instanceof Error?error.message:"No se pudo lanzar"}},{status:422});}
}
