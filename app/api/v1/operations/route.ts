import { NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/api-auth";
import { operationsDashboard } from "@/lib/operations";

export async function GET(request:Request){
  const principal=await authenticateApiRequest(request,"settings:read");
  if(!principal)return NextResponse.json({error:{code:"unauthorized",message:"No autorizado"}},{status:401});
  return NextResponse.json(await operationsDashboard(),{headers:{"Cache-Control":"private, no-store"}});
}
