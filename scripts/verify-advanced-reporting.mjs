import {createHash,randomBytes,randomUUID} from "node:crypto";
import postgres from "postgres";

const databaseUrl=process.env.DATABASE_URL;if(!databaseUrl)throw new Error("DATABASE_URL es obligatoria");
const baseUrl=(process.env.VERIFY_BASE_URL??"http://localhost:3000").replace(/\/$/,"");const sql=postgres(databaseUrl,{max:1});
const runId=randomUUID(),marker=runId.replaceAll("-","").slice(0,12),token=`sm_live_reports_${marker}_${randomBytes(32).toString("base64url")}`,secretHash=createHash("sha256").update(token).digest("hex");
let apiKeyId="",listId="",segmentId="",currentCampaignId="",previousCampaignId="",completed=false;
function assert(condition,message){if(!condition)throw new Error(message);}
async function request(path){const response=await fetch(`${baseUrl}${path}`,{headers:{Authorization:`Bearer ${token}`}});const body=await response.json().catch(()=>null);return{response,body};}
async function api(path){const result=await request(path);if(!result.response.ok)throw new Error(`GET ${path}: ${result.response.status} ${JSON.stringify(result.body)}`);return result.body;}

try{
  const[key]=await sql`INSERT INTO api_keys(name,prefix,secret_hash,scopes)VALUES('Informes avanzados E2E',${`reports_${marker}`},${secretHash},${["reports:read"]})RETURNING id`;apiKeyId=key.id;
  const[list]=await sql`INSERT INTO lists(key,name,description,status)VALUES(${`reports_${marker}`},${`Lista informes ${marker}`},'Verificación de comparativas','active')RETURNING id`;listId=list.id;
  await sql`INSERT INTO list_fields(list_id,key,label,type,options,position)VALUES(${listId},'equipo','Equipo preferido','select',${sql.json(["Norte","Sur","Oculto"])},1)`;
  const[segment]=await sql`INSERT INTO segments(name,description,list_id,status,definition)VALUES(${`Segmento informes ${marker}`},'Snapshot E2E',${listId},'active','{"kind":"group","match":"all","children":[]}'::jsonb)RETURNING id`;segmentId=segment.id;
  const[current]=await sql`
    INSERT INTO campaigns(name,subject,from_name,from_email,reply_to,html_content,text_content,content_source,target_type,target_id,list_id,status,started_at,completed_at,total_recipients,sent_count,delivered_count,open_count,click_count)
    VALUES(${`Campaña actual ${marker}`},'Actual','KiroMail','reports@kiromail.local','reports@kiromail.local','<p>Actual</p>','Actual','direct','segment',${segmentId},${listId},'completed',now()-interval '1 day',now()-interval '23 hours',20,20,20,20,10) RETURNING id
  `;currentCampaignId=current.id;
  const[previous]=await sql`
    INSERT INTO campaigns(name,subject,from_name,from_email,reply_to,html_content,text_content,content_source,target_type,list_id,status,started_at,completed_at,total_recipients,sent_count,delivered_count,open_count,click_count)
    VALUES(${`Campaña anterior ${marker}`},'Anterior','KiroMail','reports@kiromail.local','reports@kiromail.local','<p>Anterior</p>','Anterior','direct','list',${listId},'completed',now()-interval '40 days',now()-interval '39 days',10,10,10,5,2) RETURNING id
  `;previousCampaignId=previous.id;

  for(let index=0;index<20;index+=1){
    const team=index<8?"Norte":index<16?"Sur":"Oculto";const opened=true,clicked=index<10;const email=`report-${marker}-${index}@example.test`;
    const[recipient]=await sql`INSERT INTO campaign_recipients(campaign_id,email,status,personalization,sent_at,delivered_at,opened_at,clicked_at,open_count,click_count)VALUES(${currentCampaignId},${email},'delivered',${sql.json({equipo:team})},now()-interval '1 day',now()-interval '1 day',${opened?new Date():null},${clicked?new Date():null},1,${clicked?1:0})RETURNING id`;
    const[message]=await sql`INSERT INTO outbound_messages(kind,campaign_id,campaign_recipient_id,to_email,from_email,from_name,reply_to,subject,status,sent_at,delivered_at)VALUES('campaign',${currentCampaignId},${recipient.id},${email},'reports@kiromail.local','KiroMail','reports@kiromail.local','Actual','delivered',now()-interval '1 day',now()-interval '1 day')RETURNING id`;
    await sql`UPDATE campaign_recipients SET outbound_message_id=${message.id} WHERE id=${recipient.id}`;
    const userAgent=index<15?"Microsoft Outlook Windows NT 10.0":"AppleMail/16.0 Macintosh";
    await sql`INSERT INTO email_events(event_key,message_id,recipient_id,campaign_id,type,source,payload,is_automated,occurred_at)VALUES(${`reports:${runId}:open:${index}`},${message.id},${recipient.id},${currentCampaignId},'opened','e2e',${sql.json({user_agent:userAgent})},false,now()-interval '23 hours')`;
    if(clicked)await sql`INSERT INTO email_events(event_key,message_id,recipient_id,campaign_id,type,source,payload,is_automated,occurred_at)VALUES(${`reports:${runId}:click:${index}`},${message.id},${recipient.id},${currentCampaignId},'clicked','e2e',${sql.json({user_agent:userAgent})},false,now()-interval '22 hours')`;
  }
  for(let index=0;index<10;index+=1)await sql`INSERT INTO campaign_recipients(campaign_id,email,status,personalization,sent_at,delivered_at,opened_at,clicked_at,open_count,click_count)VALUES(${previousCampaignId},${`previous-${marker}-${index}@example.test`},'delivered',${sql.json({equipo:index<5?"Norte":"Sur"})},now()-interval '40 days',now()-interval '40 days',${index<5?new Date(Date.now()-40*86400_000):null},${index<2?new Date(Date.now()-40*86400_000):null},${index<5?1:0},${index<2?1:0})`;

  const to=new Date(Date.now()+60_000),from=new Date(to.getTime()-30*86400_000);const query=`from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}&list_id=${listId}`;
  const report=await api(`/api/v1/reports/campaigns?${query}&breakdown_field=equipo`);
  assert(report.summary.delivered===20&&report.comparison.previous.delivered===10,"La comparación con el periodo anterior es incorrecta");
  assert(report.comparison.changes.delivered.relative_change===1,"El cambio relativo de entregas no es +100%");
  assert(report.field_breakdown.groups.length===2&&report.field_breakdown.suppressed_recipients===4,"El umbral de privacidad del campo no ocultó solo el grupo pequeño");
  assert(report.field_breakdown.groups.every(item=>["Norte","Sur"].includes(item.value)&&item.recipients===8),"El desglose no usa el snapshot categórico correcto");
  assert(report.segment_breakdown.groups.some(item=>item.id===segmentId&&item.recipients===20),"El rendimiento histórico del segmento no aparece");
  assert(report.client_signals.clients.available&&report.client_signals.clients.groups.length===2,"La taxonomía fiable de clientes no se publicó");
  assert(report.client_signals.devices.available&&report.client_signals.devices.groups[0].name==="Escritorio","La señal fiable de dispositivo no se agregó");
  const invalid=await request(`/api/v1/reports/campaigns?${query}&breakdown_field=email_privado`);assert(invalid.response.status===422&&invalid.body.error.code==="invalid_breakdown_field","Un desglose inseguro no devolvió 422");
  const[transactional,audience]=await Promise.all([api(`/api/v1/reports/transactional?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`),api(`/api/v1/reports/audience?${query}`)]);
  assert(transactional.comparison?.changes?.total&&audience.comparison?.changes?.net,"Los otros canales no incluyen comparación temporal");
  completed=true;console.log(JSON.stringify({ok:true,run_id:runId,list_id:listId,segment_id:segmentId,current_campaign_id:currentCampaignId,previous_campaign_id:previousCampaignId,invariants:{previous_period:true,field_snapshot:true,small_groups_hidden:true,segment_performance:true,reliable_client_taxonomy:true,invalid_field_rejected:true,all_channels_compared:true}},null,2));
}finally{
  const campaignIds=[currentCampaignId,previousCampaignId].filter(Boolean);
  if(campaignIds.length)await sql.begin(async tx=>{await tx`DELETE FROM outbound_messages WHERE campaign_id=ANY(${campaignIds}::uuid[])`;await tx`DELETE FROM campaigns WHERE id=ANY(${campaignIds}::uuid[])`;}).catch(()=>{});
  if(segmentId)await sql`DELETE FROM segments WHERE id=${segmentId}`.catch(()=>{});
  if(listId)await sql`DELETE FROM lists WHERE id=${listId}`.catch(()=>{});
  if(apiKeyId)await sql`UPDATE api_keys SET revoked_at=now() WHERE id=${apiKeyId}`.catch(()=>{});
  if(!completed)console.error(JSON.stringify({level:"error",event:"advanced_reporting_e2e_failed",run_id:runId}));
  await sql.end();
}
