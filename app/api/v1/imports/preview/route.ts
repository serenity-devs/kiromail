import { NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/api-auth";
import { previewCsv } from "@/lib/data-jobs";

export const runtime="nodejs";
export async function POST(request:Request){const principal=await authenticateApiRequest(request,"contacts:write");if(!principal)return NextResponse.json({error:{code:"unauthorized",message:"No autorizado"}},{status:401});try{const form=await request.formData();const file=form.get("file");if(!(file instanceof File))return NextResponse.json({error:{code:"file_required",message:"Selecciona un CSV"}},{status:422});const delimiter=String(form.get("delimiter")??"")||undefined;return NextResponse.json(previewCsv(Buffer.from(await file.arrayBuffer()),delimiter));}catch(error){return NextResponse.json({error:{code:"preview_failed",message:error instanceof Error?error.message:"No se pudo leer el CSV"}},{status:422});}}
