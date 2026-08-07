import { NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/api-auth";
import { sql } from "@/lib/db";
export async function GET(request:Request,context:{params:Promise<{id:string}>}){const principal=await authenticateApiRequest(request,"webhooks:read");if(!principal)return NextResponse.json({error:{code:"unauthorized",message:"No autorizado"}},{status:401});const{id}=await context.params;return NextResponse.json({data:await sql`SELECT id,event_id,event_type,status,attempt_count,response_status,response_body,next_attempt_at,delivered_at,created_at FROM webhook_deliveries WHERE endpoint_id=${id} ORDER BY created_at DESC LIMIT 200`});}
