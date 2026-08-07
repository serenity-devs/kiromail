import { NextResponse } from "next/server";
import { confirmSubscription, requestIp } from "@/lib/public-preferences";

export async function POST(request:Request){
  const type=request.headers.get("content-type")??"";
  const token=type.includes("application/json")?String((await request.json()).token??""):String((await request.formData()).get("token")??"");
  const result=await confirmSubscription(token,requestIp(request),request.headers.get("user-agent")??"");
  if(!result.confirmed)return NextResponse.json({error:"El enlace no es válido o ha caducado"},{status:400});
  if((request.headers.get("accept")??"").includes("text/html"))return NextResponse.redirect(new URL("/confirm/done",request.url),303);
  return NextResponse.json({confirmed:true,already_active:result.alreadyActive});
}
