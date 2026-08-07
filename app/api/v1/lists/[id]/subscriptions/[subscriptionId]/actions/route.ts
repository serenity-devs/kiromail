import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateApiRequest } from "@/lib/api-auth";
import { sql } from "@/lib/db";
import { validateListValues } from "@/lib/list-fields";

const schema=z.object({action:z.enum(["unsubscribe","reactivate","archive"]),source:z.string().trim().min(1).max(80).default("api"),reason:z.string().max(500).default(""),fields:z.record(z.string(),z.unknown()).optional()});

export async function POST(request:Request,context:{params:Promise<{id:string;subscriptionId:string}>}){
  const principal=await authenticateApiRequest(request,"contacts:write");
  if(!principal)return NextResponse.json({error:{code:"unauthorized",message:"No autorizado"}},{status:401});
  try{
    const {id,subscriptionId}=await context.params;const input=schema.parse(await request.json());
    const [current]=await sql<{contact_id:string;status:string;custom_values:Record<string,unknown>}[]>`SELECT contact_id,status,custom_values FROM subscriptions WHERE id=${subscriptionId} AND list_id=${id}`;
    if(!current)return NextResponse.json({error:{code:"not_found",message:"Suscripción no encontrada"}},{status:404});
    if(input.action==="reactivate"){
      if(current.status!=="unsubscribed")return NextResponse.json({error:{code:"invalid_transition",message:"Solo se puede reactivar una baja"}},{status:409});
      const values={...(current.custom_values??{}),...(input.fields??{})};const validation=await validateListValues(id,values,true);
      if(!validation.valid)return NextResponse.json({error:{code:"invalid_fields",message:"Campos no válidos",fields:validation.errors}},{status:422});
      const stored=JSON.parse(JSON.stringify(values)) as never;
      const [subscription]=await sql.begin(async(tx)=>{
        const [updated]=await tx`UPDATE subscriptions SET status='active',custom_values=${tx.json(stored)},reactivated_at=now(),subscribed_at=now(),unsubscribed_at=NULL,updated_at=now() WHERE id=${subscriptionId} RETURNING *`;
        await tx`INSERT INTO consent_events(contact_id,subscription_id,list_id,action,source,consent_text,api_key_id,detail) VALUES(${current.contact_id},${subscriptionId},${id},'resubscribed',${input.source},${input.reason},${principal.kind==="api_key"?principal.id:null},${tx.json({explicit:true})})`;
        return [updated];
      });return NextResponse.json(subscription);
    }
    const nextStatus=input.action==="unsubscribe"?"unsubscribed":"archived";const consentAction=input.action==="unsubscribe"?"unsubscribed":"archived";
    const [subscription]=await sql.begin(async(tx)=>{
      const [updated]=await tx`UPDATE subscriptions SET status=${nextStatus},unsubscribed_at=CASE WHEN ${nextStatus}='unsubscribed' THEN COALESCE(unsubscribed_at,now()) ELSE unsubscribed_at END,updated_at=now() WHERE id=${subscriptionId} AND status<>${nextStatus} RETURNING *`;
      if(updated)await tx`INSERT INTO consent_events(contact_id,subscription_id,list_id,action,source,consent_text,api_key_id) VALUES(${current.contact_id},${subscriptionId},${id},${consentAction},${input.source},${input.reason},${principal.kind==="api_key"?principal.id:null})`;
      return [updated];
    });
    if(!subscription)return NextResponse.json({error:{code:"invalid_transition",message:"La suscripción ya estaba en ese estado"}},{status:409});
    return NextResponse.json(subscription);
  }catch(error){if(error instanceof z.ZodError)return NextResponse.json({error:{code:"validation_error",message:"Datos no válidos",issues:error.issues}},{status:422});console.error(error);return NextResponse.json({error:{code:"internal_error",message:"No se pudo cambiar la suscripción"}},{status:500});}
}
