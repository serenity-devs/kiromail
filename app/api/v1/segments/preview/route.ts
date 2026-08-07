import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateApiRequest } from "@/lib/api-auth";
import { previewSegment,validateSegmentDefinition } from "@/lib/segment-service";

const schema=z.object({list_id:z.string().uuid(),definition:z.unknown()});
export async function POST(request:Request){const principal=await authenticateApiRequest(request,"lists:read");if(!principal)return NextResponse.json({error:{code:"unauthorized",message:"No autorizado"}},{status:401});try{const input=schema.parse(await request.json());const definition=await validateSegmentDefinition(input.list_id,input.definition);return NextResponse.json(await previewSegment(input.list_id,definition));}catch(error){return NextResponse.json({error:{code:"validation_error",message:error instanceof Error?error.message:"Segmento no válido"}},{status:422});}}
