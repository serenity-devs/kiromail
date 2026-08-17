import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateApiRequest } from "@/lib/api-auth";
import { getDeliverabilityDashboard,reconcileSesSuppressions,refreshDeliverabilityHealth,sendTechnicalTest } from "@/lib/deliverability";
import { sql } from "@/lib/db";
import { recoverQueuedRecipients } from "@/lib/campaign-service";
import { recoverQueuedTransactionalMessages } from "@/lib/transactional-service";

const schema=z.discriminatedUnion("action",[
  z.object({action:z.literal("check_connection")}),
  z.object({action:z.literal("send_test"),email:z.email()}),
  z.object({action:z.literal("preview_suppressions")}),
  z.object({action:z.literal("sync_suppressions"),mode:z.enum(["import","bidirectional"]).optional()}),
  z.object({action:z.literal("set_sending_paused"),paused:z.boolean(),reason:z.string().trim().max(1000).default("")}),
  z.object({action:z.literal("resolve_alert"),alert_id:z.string().uuid(),note:z.string().trim().max(1000).default("")}),
]);

export async function POST(request:Request){
  const principal=await authenticateApiRequest(request,"settings:write");if(!principal)return NextResponse.json({error:{code:"unauthorized",message:"No autorizado"}},{status:401});
  try{
    const input=schema.parse(await request.json());let result:unknown;
    if(input.action==="check_connection")result=await refreshDeliverabilityHealth();
    else if(input.action==="send_test")result=await sendTechnicalTest(input.email);
    else if(input.action==="preview_suppressions")result=await reconcileSesSuppressions("preview");
    else if(input.action==="sync_suppressions"){
      const[settings]=await sql<{ses_suppression_sync_mode:"import"|"bidirectional"}[]>`SELECT ses_suppression_sync_mode FROM settings WHERE id=1`;
      result=await reconcileSesSuppressions(input.mode??settings.ses_suppression_sync_mode);
    }else if(input.action==="set_sending_paused"){
      const[updated]=await sql`UPDATE settings SET global_sending_paused=${input.paused},updated_at=now() WHERE id=1 RETURNING global_sending_paused`;
      if(!input.paused)await Promise.all([recoverQueuedRecipients(),recoverQueuedTransactionalMessages({includeFresh:true})]);
      result=updated;
    }else{
      const[alert]=await sql`UPDATE operational_alerts SET status='resolved',resolved_at=now(),detail=detail||${sql.json({resolution_note:input.note} as never)} WHERE id=${input.alert_id} AND status='open' RETURNING *`;
      if(!alert)return NextResponse.json({error:{code:"not_found",message:"Alerta no encontrada o ya resuelta"}},{status:404});result=alert;
    }
    await sql`INSERT INTO audit_log(action,entity_type,entity_id,user_id,api_key_id,detail)VALUES(${input.action},'deliverability',${"alert_id" in input?input.alert_id:null},${principal.kind==="session"?principal.id:null},${principal.kind==="api_key"?principal.id:null},${sql.json(JSON.parse(JSON.stringify(input)) as never)})`;
    return NextResponse.json({data:result,dashboard:await getDeliverabilityDashboard()});
  }catch(error){if(error instanceof z.ZodError)return NextResponse.json({error:{code:"validation_error",message:"Acción no válida",issues:error.issues}},{status:422});console.error(error);return NextResponse.json({error:{code:"deliverability_action_failed",message:error instanceof Error?error.message:"No se pudo ejecutar la acción"}},{status:400});}
}
