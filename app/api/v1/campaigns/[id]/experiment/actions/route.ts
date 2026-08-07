import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateApiRequest } from "@/lib/api-auth";
import { selectCampaignExperimentWinner } from "@/lib/campaign-experiments";

const schema=z.discriminatedUnion("action",[z.object({action:z.literal("select_winner"),variant_id:z.string().uuid()}),z.object({action:z.literal("evaluate")})]);
export async function POST(request:Request,context:{params:Promise<{id:string}>}){const principal=await authenticateApiRequest(request,"campaigns:send");if(!principal)return NextResponse.json({error:{code:"unauthorized",message:"No autorizado"}},{status:401});try{const{id}=await context.params;const input=schema.parse(await request.json());const actor:{id:string;kind:"session"|"api_key"}={id:principal.id,kind:principal.kind};return NextResponse.json(await selectCampaignExperimentWinner(id,{variantId:input.action==="select_winner"?input.variant_id:undefined,forceEvaluation:input.action==="evaluate",actor}));}catch(error){if(error instanceof z.ZodError)return NextResponse.json({error:{code:"validation_error",message:"Acción A/B no válida",issues:error.issues}},{status:422});return NextResponse.json({error:{code:"experiment_not_ready",message:error instanceof Error?error.message:"La muestra no está lista"}},{status:409});}}
