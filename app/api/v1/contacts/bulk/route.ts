import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateApiRequest } from "@/lib/api-auth";
import { createBulkJob } from "@/lib/data-jobs";
import { sql } from "@/lib/db";

const schema=z.object({
  contact_ids:z.array(z.string().uuid()).min(1).max(10_000),
  action:z.enum(["subscribe","unsubscribe","archive","block"]),
  list_id:z.string().uuid().optional(),
  reactivate:z.boolean().default(false),
  reason:z.string().max(1000).default("Operación masiva"),
}).superRefine((value,context)=>{if(value.action!=="block"&&!value.list_id)context.addIssue({code:"custom",path:["list_id"],message:"Selecciona una lista"});});

export async function POST(request:Request){
  const principal=await authenticateApiRequest(request,"contacts:write");
  if(!principal)return NextResponse.json({error:{code:"unauthorized",message:"No autorizado"}},{status:401});
  try{
    const input=schema.parse(await request.json());
    const result=await createBulkJob(input,request.headers.get("idempotency-key")??"",principal.id);
    await sql`INSERT INTO audit_log(action,entity_type,entity_id,user_id,api_key_id,detail)VALUES('queue_bulk','background_job',${result.id},${principal.kind==="session"?principal.id:null},${principal.kind==="api_key"?principal.id:null},${sql.json({action:input.action,list_id:input.list_id??null,contacts:input.contact_ids.length,reactivate:input.reactivate})})`;
    return NextResponse.json({...result,status_url:`/api/v1/jobs/${result.id}`},{status:202});
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:{code:"validation_error",message:"Operación no válida",issues:error.issues}},{status:422});
    const message=error instanceof Error?error.message:"No se pudo iniciar la operación";
    return NextResponse.json({error:{code:message.includes("Idempotency-Key ya")?"idempotency_conflict":"bulk_failed",message}},{status:message.includes("Idempotency-Key ya")?409:422});
  }
}
