import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateApiRequest } from "@/lib/api-auth";
import { runBlobReconciliation, runRetentionMaintenance, retryDeadLetter, resolveDeadLetter } from "@/lib/operations";
import { sql } from "@/lib/db";

const schema=z.discriminatedUnion("action",[
  z.object({action:z.literal("retry_dead_letter"),id:z.uuid()}),
  z.object({action:z.literal("resolve_dead_letter"),id:z.uuid()}),
  z.object({action:z.literal("run_retention")}),
  z.object({action:z.literal("reconcile_blobs")}),
]);

export async function POST(request:Request){
  const principal=await authenticateApiRequest(request,"settings:write");
  if(!principal)return NextResponse.json({error:{code:"unauthorized",message:"No autorizado"}},{status:401});
  const parsed=schema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return NextResponse.json({error:{code:"validation_error",message:"Acción operativa no válida"}},{status:422});
  try{
    const result=parsed.data.action==="retry_dead_letter"?await retryDeadLetter(parsed.data.id):parsed.data.action==="resolve_dead_letter"?await resolveDeadLetter(parsed.data.id):parsed.data.action==="run_retention"?await runRetentionMaintenance():await runBlobReconciliation();
    await sql`INSERT INTO audit_log(action,entity_type,entity_id,user_id,api_key_id,request_id,detail)VALUES(${parsed.data.action},'operations',${"id" in parsed.data?parsed.data.id:null},${principal.kind==="session"?principal.id:null},${principal.kind==="api_key"?principal.id:null},${request.headers.get("x-request-id")},${sql.json(result as never)})`;
    return NextResponse.json({ok:true,data:result});
  }catch(error){return NextResponse.json({error:{code:"operation_failed",message:error instanceof Error?error.message:"No se pudo completar la acción"}},{status:409});}
}
