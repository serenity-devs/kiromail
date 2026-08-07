import { NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/api-auth";
import { rollbackImport } from "@/lib/data-jobs";
export async function POST(request:Request,context:{params:Promise<{id:string}>}){const principal=await authenticateApiRequest(request,"contacts:write");if(!principal)return NextResponse.json({error:{code:"unauthorized",message:"No autorizado"}},{status:401});try{const{id}=await context.params;return NextResponse.json(await rollbackImport(id));}catch(error){return NextResponse.json({error:{code:"invalid_state",message:error instanceof Error?error.message:"No se pudo revertir"}},{status:409});}}
