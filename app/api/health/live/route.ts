import { NextResponse } from "next/server";

export async function GET(){
  return NextResponse.json({status:"alive",time:new Date().toISOString()},{headers:{"Cache-Control":"no-store"}});
}
