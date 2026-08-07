import { NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/api-auth";
import { sql } from "@/lib/db";
import { csv, getCampaignsReport,ReportingError } from "@/lib/reporting";

function range(url:URL){const to=new Date(url.searchParams.get("to")??Date.now()+60_000);const from=new Date(url.searchParams.get("from")??to.getTime()-30*86400_000);return{from,to,listId:url.searchParams.get("list_id"),breakdownField:url.searchParams.get("breakdown_field")};}

export async function GET(request:Request){
  const principal=await authenticateApiRequest(request,"reports:read");if(!principal)return NextResponse.json({error:{code:"unauthorized",message:"No autorizado"}},{status:401});
  const url=new URL(request.url);const selected=range(url);if(Number.isNaN(selected.from.getTime())||Number.isNaN(selected.to.getTime())||selected.from>=selected.to)return NextResponse.json({error:{code:"invalid_range",message:"El intervalo de fechas no es válido"}},{status:422});
  let report;try{report=await getCampaignsReport(selected);}catch(error){if(error instanceof ReportingError)return NextResponse.json({error:{code:error.code,message:error.message}},{status:error.status});throw error;}
  if(url.searchParams.get("format")==="csv"){
    await sql`INSERT INTO audit_log(action,entity_type,user_id,api_key_id,detail)VALUES('export','campaign_report',${principal.kind==="session"?principal.id:null},${principal.kind==="api_key"?principal.id:null},${sql.json({from:selected.from,to:selected.to,list_id:selected.listId,rows:report.campaigns.length})})`;
    return new Response(csv([["Campaña","Lista","Estado","Inicio","Destinatarios","Enviados","Entregados","Aperturas únicas","Aperturas totales","Clics únicos","Clics totales","Rebotes","Quejas","Bajas"],...report.campaigns.map(item=>[item.name,item.list_name,item.status,item.started_at?.toISOString()??item.created_at.toISOString(),item.total_recipients,item.sent_count,item.delivered_count,item.unique_opens,item.open_count,item.unique_clicks,item.click_count,item.bounce_count,item.complaint_count,item.unsubscribe_count])]),{headers:{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":'attachment; filename="serenity-mail-campanas.csv"'}});
  }
  return NextResponse.json(report);
}
