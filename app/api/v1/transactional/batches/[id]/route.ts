import { NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/api-auth";
import { sql } from "@/lib/db";

export async function GET(request:Request,context:{params:Promise<{id:string}>}){const principal=await authenticateApiRequest(request,"transactional:read");if(!principal)return NextResponse.json({error:{code:"unauthorized",message:"No autorizado"}},{status:401});const{id}=await context.params;const[batch]=await sql`SELECT id,status,total_count,accepted_count,failed_count,result,created_at,completed_at FROM transactional_batches WHERE id=${id}`;if(!batch)return NextResponse.json({error:{code:"not_found",message:"Lote no encontrado"}},{status:404});return NextResponse.json(batch);}
