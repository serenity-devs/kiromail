import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { productionConfigurationChecks } from "@/lib/config";

export async function GET() {
  try {
    await sql`SELECT 1`;
    const[deliverability]=await sql<{transport:string;status:string;checked_at:Date}[]>`SELECT transport,status,checked_at FROM ses_health_snapshots ORDER BY checked_at DESC LIMIT 1`;
    const[worker]=await sql<{heartbeat_at:Date}[]>`SELECT heartbeat_at FROM worker_heartbeats WHERE service='worker' ORDER BY heartbeat_at DESC LIMIT 1`;
    return NextResponse.json({ status: "ok",database:"ok",worker:worker?{status:new Date(worker.heartbeat_at).getTime()>Date.now()-60_000?"ok":"stale",heartbeat_at:worker.heartbeat_at}:null,deliverability:deliverability??null,configuration:productionConfigurationChecks() },{headers:{"Cache-Control":"no-store"}});
  } catch {
    return NextResponse.json({ status: "unhealthy" }, { status: 503 });
  }
}
