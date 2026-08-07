import { NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/api-auth";
import { getDeliverabilityDashboard } from "@/lib/deliverability";

export const dynamic="force-dynamic";

export async function GET(request:Request){
  const principal=await authenticateApiRequest(request,"reports:read");
  if(!principal)return NextResponse.json({error:{code:"unauthorized",message:"No autorizado"}},{status:401});
  try{
    const refresh=new URL(request.url).searchParams.get("refresh")==="true";
    if(refresh&&!await authenticateApiRequest(request,"settings:write"))return NextResponse.json({error:{code:"forbidden",message:"Solo un administrador puede consultar Amazon SES en tiempo real"}},{status:403});
    return NextResponse.json(await getDeliverabilityDashboard({refresh}));
  }catch(error){console.error(error);return NextResponse.json({error:{code:"deliverability_failed",message:error instanceof Error?error.message:"No se pudo cargar la entregabilidad"}},{status:500});}
}
