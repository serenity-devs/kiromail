import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateApiRequest } from "@/lib/api-auth";
import { getCampaignReport } from "@/lib/reporting";

const querySchema=z.object({status:z.string().max(40).nullable(),query:z.string().max(320).nullable(),page:z.coerce.number().int().min(1).default(1),limit:z.coerce.number().int().min(1).max(200).default(50)});

export async function GET(request:Request,context:{params:Promise<{id:string}>}){
  const principal=await authenticateApiRequest(request,"reports:read");if(!principal)return NextResponse.json({error:{code:"unauthorized",message:"No autorizado"}},{status:401});
  try{const{id}=await context.params;const url=new URL(request.url);const input=querySchema.parse({status:url.searchParams.get("status"),query:url.searchParams.get("query"),page:url.searchParams.get("page")??1,limit:url.searchParams.get("limit")??50});const report=await getCampaignReport(id,input);if(!report)return NextResponse.json({error:{code:"not_found",message:"Campaña no encontrada"}},{status:404});return NextResponse.json(report);}catch(error){if(error instanceof z.ZodError)return NextResponse.json({error:{code:"validation_error",message:"Filtros no válidos",issues:error.issues}},{status:422});throw error;}
}
