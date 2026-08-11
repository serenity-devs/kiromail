import { NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/api-auth";
import { sql } from "@/lib/db";
import { csv, getTransactionalReport } from "@/lib/reporting";

export async function GET(request:Request){
  const principal=await authenticateApiRequest(request,"reports:read");if(!principal)return NextResponse.json({error:{code:"unauthorized",message:"No autorizado"}},{status:401});
  const url=new URL(request.url);const to=new Date(url.searchParams.get("to")??Date.now()+60_000);const from=new Date(url.searchParams.get("from")??to.getTime()-30*86400_000);if(Number.isNaN(from.getTime())||Number.isNaN(to.getTime())||from>=to)return NextResponse.json({error:{code:"invalid_range",message:"El intervalo de fechas no es válido"}},{status:422});
  const report=await getTransactionalReport({from,to});
  if(url.searchParams.get("format")==="csv"){
    await sql`INSERT INTO audit_log(action,entity_type,user_id,api_key_id,detail)VALUES('export','transactional_report',${principal.kind==="session"?principal.id:null},${principal.kind==="api_key"?principal.id:null},${sql.json({from,to})})`;
    return new Response(csv([["Fecha","Solicitados","Entregados","Fallidos","Abiertos","Clics"],...report.daily.map(row=>[String(row.date),Number(row.total),Number(row.delivered),Number(row.failed),Number(row.opened),Number(row.clicked)])]),{headers:{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":'attachment; filename="kiromail-transaccionales.csv"'}});
  }
  return NextResponse.json(report);
}
