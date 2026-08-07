import { NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/api-auth";
import { sql } from "@/lib/db";
import { csv, getCampaignReport } from "@/lib/reporting";

export async function GET(request:Request,context:{params:Promise<{id:string}>}){
  const principal=await authenticateApiRequest(request,"reports:read");if(!principal)return NextResponse.json({error:{code:"unauthorized",message:"No autorizado"}},{status:401});
  const{id}=await context.params;const url=new URL(request.url);const kind=url.searchParams.get("kind")??"recipients";if(!["recipients","events","links"].includes(kind))return NextResponse.json({error:{code:"invalid_kind",message:"Exportación no válida"}},{status:422});
  const[campaign]=await sql<{name:string}[]>`SELECT name FROM campaigns WHERE id=${id} AND archived_at IS NULL`;if(!campaign)return NextResponse.json({error:{code:"not_found",message:"Campaña no encontrada"}},{status:404});
  let rows:(string|number|null|undefined)[][];
  if(kind==="recipients"){
    const data=await sql`SELECT cr.email,cr.status,cr.sent_at,cr.delivered_at,cr.opened_at,cr.clicked_at,cr.open_count,cr.click_count,cr.failure_reason,v.name AS variant_name,om.ses_message_id FROM campaign_recipients cr LEFT JOIN campaign_variants v ON v.id=cr.variant_id LEFT JOIN outbound_messages om ON om.id=cr.outbound_message_id WHERE cr.campaign_id=${id} ORDER BY cr.created_at LIMIT 100000`;
    rows=[["Email","Estado","Enviado","Entregado","Primera apertura","Primer clic","Aperturas totales","Clics totales","Variante","ID proveedor","Error"],...data.map(row=>[String(row.email),String(row.status),row.sent_at?String(row.sent_at):null,row.delivered_at?String(row.delivered_at):null,row.opened_at?String(row.opened_at):null,row.clicked_at?String(row.clicked_at):null,Number(row.open_count),Number(row.click_count),row.variant_name?String(row.variant_name):null,row.ses_message_id?String(row.ses_message_id):null,row.failure_reason?String(row.failure_reason):null])];
  }else if(kind==="events"){
    const data=await sql`SELECT e.occurred_at,cr.email,e.type,e.source,e.link_url,e.is_automated FROM email_events e LEFT JOIN campaign_recipients cr ON cr.id=e.recipient_id WHERE e.campaign_id=${id} ORDER BY e.occurred_at,e.id LIMIT 250000`;
    rows=[["Fecha","Email","Evento","Origen","Enlace","Probable automatización"],...data.map(row=>[String(row.occurred_at),row.email?String(row.email):null,String(row.type),String(row.source),row.link_url?String(row.link_url):null,row.is_automated?"sí":"no"])];
  }else{
    const report=await getCampaignReport(id,{page:1,limit:1});rows=[["URL","Categoría","Clics únicos","Clics totales","Clics automatizados"],...(report?.links??[]).map(row=>[String(row.url),String(row.category),Number(row.unique_clicks),Number(row.total_clicks),Number(row.automated_clicks)])];
  }
  await sql`INSERT INTO audit_log(action,entity_type,entity_id,user_id,api_key_id,detail)VALUES('export','campaign_report',${id},${principal.kind==="session"?principal.id:null},${principal.kind==="api_key"?principal.id:null},${sql.json({kind,rows:rows.length-1})})`;
  const safeName=campaign.name.normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/gi,"-").replace(/^-|-$/g,"").toLowerCase().slice(0,80)||"campana";
  return new Response(csv(rows),{headers:{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":`attachment; filename="${safeName}-${kind}.csv"`}});
}
