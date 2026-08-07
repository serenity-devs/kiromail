import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateApiRequest } from "@/lib/api-auth";
import { approveCampaign,cancelCampaign,commentOnCampaignApproval,pauseCampaign,rejectCampaign,requestCampaignApproval,scheduleCampaign,startCampaign,unscheduleCampaign } from "@/lib/campaign-service";

const schema=z.discriminatedUnion("action",[
  z.object({action:z.literal("schedule"),scheduled_at:z.iso.datetime()}),
  z.object({action:z.literal("unschedule")}),
  z.object({action:z.literal("pause")}),
  z.object({action:z.literal("resume")}),
  z.object({action:z.literal("cancel")}),
  z.object({action:z.literal("request_approval"),comment:z.string().trim().min(1).max(2000)}),
  z.object({action:z.literal("approve"),comment:z.string().trim().min(1).max(2000)}),
  z.object({action:z.literal("reject"),comment:z.string().trim().min(1).max(2000)}),
  z.object({action:z.literal("comment"),comment:z.string().trim().min(1).max(2000)}),
]);

export async function POST(request:Request,context:{params:Promise<{id:string}>}){
  try{
    const{id}=await context.params;z.string().uuid().parse(id);const input=schema.parse(await request.json());
    const requiredScope=["approve","reject"].includes(input.action)?"campaigns:approve":["request_approval","comment"].includes(input.action)?"campaigns:write":"campaigns:send";
    const principal=await authenticateApiRequest(request,requiredScope);if(!principal)return NextResponse.json({error:{code:"unauthorized",message:"No autorizado"}},{status:401});
    const actor:{id:string;kind:"session"|"api_key"}={id:principal.id,kind:principal.kind};
    const result=input.action==="schedule"?await scheduleCampaign(id,new Date(input.scheduled_at),actor):input.action==="unschedule"?await unscheduleCampaign(id,actor):input.action==="pause"?await pauseCampaign(id,actor):input.action==="cancel"?await cancelCampaign(id,actor):input.action==="request_approval"?await requestCampaignApproval(id,input.comment,actor):input.action==="approve"?await approveCampaign(id,input.comment,actor):input.action==="reject"?await rejectCampaign(id,input.comment,actor):input.action==="comment"?await commentOnCampaignApproval(id,input.comment,actor):await startCampaign(id,{action:"resume",actor});
    return NextResponse.json(result,{status:input.action==="resume"?202:200});
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:{code:"validation_error",message:"Acción no válida",issues:error.issues}},{status:422});
    return NextResponse.json({error:{code:"invalid_state",message:error instanceof Error?error.message:"No se pudo cambiar la campaña"}},{status:409});
  }
}
