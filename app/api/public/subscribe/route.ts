import { NextResponse } from "next/server";
import { z } from "zod";
import { requestIp, requestPublicSubscription } from "@/lib/public-preferences";

const schema=z.object({
  list_key:z.string().trim().min(2).max(160),email:z.email(),first_name:z.string().trim().max(200).default(""),last_name:z.string().trim().max(200).default(""),phone:z.string().trim().max(80).default(""),
  fields:z.record(z.string(),z.unknown()).default({}),consent_text:z.string().max(5000).default(""),
});

export async function POST(request:Request){
  try{
    const input=schema.parse(await request.json());
    const result=await requestPublicSubscription({listKey:input.list_key,email:input.email,firstName:input.first_name,lastName:input.last_name,phone:input.phone,fields:input.fields,consentText:input.consent_text,ip:requestIp(request),userAgent:request.headers.get("user-agent")??""});
    if(!result.accepted)return NextResponse.json({error:{code:"invalid_fields",message:"Los campos no son válidos",fields:result.errors}},{status:422});
    return NextResponse.json({accepted:true,message:"Si la lista está disponible, recibirás instrucciones por email."},{status:202,headers:{"Cache-Control":"no-store"}});
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:{code:"validation_error",message:"Petición no válida",issues:error.issues}},{status:422});
    console.error(error);return NextResponse.json({accepted:true,message:"Si la lista está disponible, recibirás instrucciones por email."},{status:202});
  }
}
