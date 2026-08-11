import { createHash,randomBytes,randomUUID } from "node:crypto";
import postgres from "postgres";

const databaseUrl=process.env.DATABASE_URL;if(!databaseUrl)throw new Error("DATABASE_URL es obligatoria");
const baseUrl=process.env.VERIFY_BASE_URL??"http://localhost:3000";const sql=postgres(databaseUrl,{max:1});const runId=randomUUID();const prefix=`campaign_${runId.replaceAll("-","").slice(0,12)}`;const token=`sm_live_${prefix}_${randomBytes(32).toString("base64url")}`;let apiKeyId;
function assert(condition,message){if(!condition)throw new Error(message);}
async function request(path,options={}){const response=await fetch(`${baseUrl}${path}`,{...options,headers:{Authorization:`Bearer ${token}`,...(options.headers??{})}});const body=await response.json().catch(()=>({}));return{response,body};}
async function api(path,options={}){const result=await request(path,options);if(!result.response.ok)throw new Error(`${options.method??"GET"} ${path}: ${result.response.status} ${JSON.stringify(result.body)}`);return result.body;}
async function waitFor(campaignId,predicate,label){for(let attempt=0;attempt<80;attempt+=1){const detail=await api(`/api/v1/campaigns/${campaignId}`);if(predicate(detail))return detail;await new Promise(resolve=>setTimeout(resolve,250));}throw new Error(`Timeout esperando ${label}`);}

try{
  const[key]=await sql`INSERT INTO api_keys(name,prefix,secret_hash,scopes)VALUES('Verificación ciclo campañas',${prefix},${createHash("sha256").update(token).digest("hex")},${["lists:read","lists:write","contacts:write","contacts:read","campaigns:read","campaigns:write","campaigns:send"]})RETURNING id`;apiKeyId=key.id;
  const list=await api("/api/v1/lists",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({key:`ciclo_${runId.replaceAll("-","").slice(0,12)}`,name:`Ciclo campañas E2E ${runId.slice(0,8)}`,default_from_name:"KiroMail E2E",default_from_email:"hola@kiromail.local",default_reply_to:"hola@kiromail.local",legal_footer:"Prueba controlada de ciclo de campañas",double_opt_in:false})});
  for(let index=1;index<=6;index+=1)await api(`/api/v1/lists/${list.id}/subscriptions`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:`campaign-lifecycle-${runId}-${index}@example.com`,first_name:`Persona ${index}`,status:"active",source:"campaign_lifecycle_e2e",consent_text:"Prueba E2E controlada"})});
  const created=await api("/api/v1/campaigns",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:`Ciclo avanzado E2E ${runId.slice(0,8)}`,list_id:list.id,subject:"Asunto inicial de ciclo",content:{html:`<main><h1>Hola {{first_name}}</h1><p>Ciclo ${runId}</p></main>`,text:`Ciclo ${runId}`}})});
  assert(created.version===1&&created.status==="draft","La campaña no nació como borrador v1");
  const updated=await api(`/api/v1/campaigns/${created.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({version:1,name:`Ciclo avanzado editado ${runId.slice(0,8)}`,subject:"Asunto editado con control de versión"})});
  assert(updated.version===2&&updated.subject.includes("editado"),"La edición no incrementó versión");
  const stale=await request(`/api/v1/campaigns/${created.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({version:1,name:"Edición obsoleta"})});
  assert(stale.response.status===409&&stale.body.error?.code==="version_conflict","Una edición obsoleta no produjo 409");
  const scheduledAt=new Date(Date.now()+120_000).toISOString();
  const scheduled=await api(`/api/v1/campaigns/${created.id}/actions`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"schedule",scheduled_at:scheduledAt})});assert(scheduled.status==="scheduled","No se programó la campaña");
  const unscheduled=await api(`/api/v1/campaigns/${created.id}/actions`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"unschedule"})});assert(unscheduled.status==="draft","No se retiró la programación");
  const duplicate=await api(`/api/v1/campaigns/${created.id}/duplicate`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:`Copia exacta E2E ${runId.slice(0,8)}`})});assert(duplicate.status==="draft"&&duplicate.duplicated_from_id===created.id&&duplicate.html_content===created.html_content,"La copia no conserva contenido y origen");
  const preflight=await api(`/api/v1/campaigns/${created.id}/preflight`);assert(preflight.valid&&preflight.audience.included===6,"El preflight no obtuvo seis destinatarios");
  await api(`/api/v1/campaigns/${created.id}/launch`,{method:"POST",headers:{"Content-Type":"application/json","Idempotency-Key":`launch-${runId}`},body:JSON.stringify({confirm_recipient_count:6})});
  await waitFor(created.id,item=>item.status==="sending"&&item.recipients.length===6,"snapshot inicial");
  await api(`/api/v1/campaigns/${created.id}/actions`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"pause"})});
  const paused=await api(`/api/v1/campaigns/${created.id}`);assert(paused.status==="paused"&&paused.recipients.length===6,"La pausa no conservó seis destinatarios");
  const lateEmail=`campaign-lifecycle-${runId}-late@example.com`;await api(`/api/v1/lists/${list.id}/subscriptions`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:lateEmail,first_name:"Alta tardía",status:"active",source:"campaign_lifecycle_e2e",consent_text:"Alta posterior al snapshot"})});
  const resumed=await api(`/api/v1/campaigns/${created.id}/actions`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"resume"})});assert(resumed.snapshotReused===true&&resumed.recipients===6,"La reanudación recalculó la audiencia");
  const completed=await waitFor(created.id,item=>item.status==="completed","finalización");
  assert(completed.total_recipients===6&&completed.delivered_count===6,"La campaña no terminó con seis entregas exactas");
  assert(!completed.recipients.some(item=>item.email===lateEmail),"La alta posterior entró en el snapshot congelado");
  const actions=completed.transitions.map(item=>item.action);for(const expected of ["schedule","unschedule","launch","pause","resume","auto_complete"])assert(actions.includes(expected),`Falta la transición ${expected}`);
  const recipientCounts=await sql`SELECT count(*)::int AS total,count(DISTINCT contact_id)::int AS distinct_contacts,count(*) FILTER(WHERE attempt_count>0)::int AS attempted FROM campaign_recipients WHERE campaign_id=${created.id}`;assert(recipientCounts[0].total===6&&recipientCounts[0].distinct_contacts===6&&recipientCounts[0].attempted===6,"La reclamación atómica no dejó seis destinatarios únicos intentados");
  console.log(JSON.stringify({ok:true,run_id:runId,list_id:list.id,campaign_id:created.id,duplicate_id:duplicate.id,version_conflict:stale.response.status,snapshot_recipients:completed.total_recipients,delivered:completed.delivered_count,late_contact_excluded:true,transitions:actions},null,2));
}finally{if(apiKeyId)await sql`UPDATE api_keys SET revoked_at=now() WHERE id=${apiKeyId}`;await sql.end();}
