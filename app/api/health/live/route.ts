import { NextResponse } from "next/server";
import { buildInfo } from "@/lib/build-info";

export async function GET(){
  return NextResponse.json({status:"alive",time:new Date().toISOString(),build:buildInfo},{headers:{"Cache-Control":"no-store"}});
}
