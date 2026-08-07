import { createHash, randomBytes, randomUUID } from "node:crypto";
import postgres from "postgres";

const databaseUrl=process.env.DATABASE_URL;
if(!databaseUrl)throw new Error("DATABASE_URL es obligatoria");
const baseUrl=(process.env.VERIFY_BASE_URL??"http://localhost:3000").replace(/\/$/,"");
const sql=postgres(databaseUrl,{max:1});
const runId=randomUUID();
const marker=runId.replaceAll("-","").slice(0,12);
const sourceEmail=`privacy-duplicate-${marker}@example.test`;
const survivorEmail=`privacy-survivor-${marker}@example.test`;
const listKey=`privacy_e2e_${marker}`;
const token=`sm_live_privacy_${marker}_${randomBytes(32).toString("base64url")}`;
const secretHash=createHash("sha256").update(token).digest("hex");
let apiKeyId="";let listId="";let sourceId="";let survivorId="";let messageId="";let importJobId="";let completed=false;

function assert(condition,message){if(!condition)throw new Error(message);}
async function request(path,options={}){
  const response=await fetch(`${baseUrl}${path}`,{...options,headers:{Authorization:`Bearer ${token}`,...(options.headers??{})}});
  const text=await response.text();let body;try{body=text?JSON.parse(text):null;}catch{body=text;}
  return{response,body};
}
async function api(path,options={}){const result=await request(path,options);if(!result.response.ok)throw new Error(`${options.method??"GET"} ${path}: ${result.response.status} ${JSON.stringify(result.body)}`);return result;}
function json(method,body,extra={}){return{method,headers:{"Content-Type":"application/json",...(extra.headers??{})},body:JSON.stringify(body),...extra};}
async function waitForMessage(id){for(let attempt=0;attempt<60;attempt++){const{body}=await api(`/api/v1/transactional/messages/${id}`);if(["delivered","sent","failed"].includes(body.status))return body;await new Promise(resolve=>setTimeout(resolve,250));}throw new Error("El mensaje transaccional no terminó a tiempo");}
async function waitForImport(id){for(let attempt=0;attempt<80;attempt++){const{body}=await api(`/api/v1/imports/${id}`);if(["completed","failed","cancelled"].includes(body.status))return body;await new Promise(resolve=>setTimeout(resolve,250));}throw new Error("La importación no terminó a tiempo");}

try{
  const[key]=await sql`INSERT INTO api_keys(name,prefix,secret_hash,scopes) VALUES('Privacidad E2E',${`privacy_${marker}`},${secretHash},${["contacts:read","contacts:write","lists:read","lists:write","transactional:send","transactional:read"]}) RETURNING id`;
  apiKeyId=key.id;
  const list=(await api("/api/v1/lists",json("POST",{key:listKey,name:`Privacidad E2E ${marker}`,description:"Lista temporal para verificar fusión y privacidad",public_signup_enabled:true,double_opt_in:false,preference_center_visible:true,consent_text_default:"Consentimiento E2E"}))).body;
  listId=list.id;
  const source=(await api("/api/v1/contacts",json("POST",{email:sourceEmail,first_name:"Registro",last_name:"Duplicado",phone:"+34 600 111 222",fields:{city:"Sevilla",source_value:"origen"},source:"privacy_e2e"}))).body;
  const survivor=(await api("/api/v1/contacts",json("POST",{email:survivorEmail,first_name:"Registro",last_name:"Principal",fields:{country:"ES",target_value:"principal"},source:"privacy_e2e"}))).body;
  sourceId=source.id;survivorId=survivor.id;
  await api(`/api/v1/lists/${listId}/subscriptions`,json("POST",{email:sourceEmail,status:"active",source:"privacy_e2e",consent_text:"Alta duplicado",fields:{}}));
  const survivorSubscription=(await api(`/api/v1/lists/${listId}/subscriptions`,json("POST",{email:survivorEmail,status:"active",source:"privacy_e2e",consent_text:"Alta principal",fields:{}}))).body;
  await api(`/api/v1/lists/${listId}/subscriptions/${survivorSubscription.id}/actions`,json("POST",{action:"unsubscribe",source:"privacy_e2e",reason:"Baja previa que debe prevalecer"}));

  const merge=(await api(`/api/v1/contacts/${sourceId}/actions`,json("POST",{action:"merge",survivor_contact_id:survivorId,field_strategy:"fill_empty",reason:"Duplicado confirmado por verificación E2E"}))).body;
  assert(merge.status==="merged"&&merge.collapsed_subscriptions===1,"La fusión no consolidó la suscripción duplicada");
  const mergedDetail=(await api(`/api/v1/contacts/${survivorId}`)).body;
  assert(mergedDetail.subscriptions.length===1&&mergedDetail.subscriptions[0].status==="unsubscribed","La baja no prevaleció tras la fusión");
  assert(mergedDetail.first_name==="Registro"&&mergedDetail.custom_fields.city==="Sevilla"&&mergedDetail.custom_fields.country==="ES","La estrategia fill_empty no combinó los datos globales");
  const sourceGone=await request(`/api/v1/contacts/${sourceId}`);
  assert(sourceGone.response.status===410&&sourceGone.body?.error?.survivor_contact_id===survivorId,"El duplicado no quedó enlazado al superviviente");

  const exported=await api(`/api/v1/contacts/${survivorId}/export`);
  assert(exported.response.headers.get("content-disposition")?.includes(`contact-${survivorId}.json`),"La exportación no se entrega como adjunto JSON");
  assert(exported.body.export?.request_id&&exported.body.subscriptions.length===1&&exported.body.merges.length===1,"La exportación individual está incompleta");

  const accepted=(await api("/api/v1/transactional/send",json("POST",{to:{email:survivorEmail,name:"Nombre privado"},subject:`Dato privado ${survivorEmail}`,html:`<p>Contenido privado de ${survivorEmail}</p>`,text:`Contenido privado de ${survivorEmail}`,variables:{email:survivorEmail},metadata:{run_id:runId,private_email:survivorEmail},track_opens:true,track_clicks:true},{headers:{"Idempotency-Key":`privacy-message-${runId}`}}))).body;
  messageId=accepted.id;
  const delivered=await waitForMessage(messageId);
  assert(delivered.status!=="failed","El mensaje previo a la anonimización falló");
  const[linked]=await sql`SELECT contact_id FROM outbound_messages WHERE id=${messageId}`;
  assert(linked.contact_id===survivorId,"El mensaje transaccional no se vinculó al contacto por email");

  const anonymized=(await api(`/api/v1/contacts/${survivorId}/actions`,json("POST",{action:"anonymize",reason:"Solicitud de supresión E2E"}))).body;
  assert(anonymized.status==="anonymized"&&anonymized.privacy_request_id,"La anonimización no quedó registrada");
  const message=(await api(`/api/v1/transactional/messages/${messageId}`)).body;
  assert(message.to_email.endsWith("@invalid.local")&&message.subject==="[redactado por privacidad]","La identidad histórica del mensaje no fue redactada");
  assert(message.has_html===false&&message.has_text===false&&message.metadata.privacy_redacted===true,"La previsualización o metadatos privados siguen accesibles");
  assert(message.events.every(event=>event.link_url==null&&event.payload.privacy_redacted===true),"Los eventos históricos conservan información personal");
  const expiredContent=await request(`/api/v1/transactional/messages/${messageId}/content?part=html`);
  assert(expiredContent.response.status===410,"El HTML histórico sigue disponible tras anonimizar");
  const contactGone=await request(`/api/v1/contacts/${survivorId}`);
  assert(contactGone.response.status===410&&contactGone.body?.error?.code==="contact_anonymized","El contacto anonimizado continúa accesible");

  const recreate=await request("/api/v1/contacts",json("POST",{email:survivorEmail,source:"privacy_e2e"}));
  assert(recreate.response.status===409&&recreate.body?.error?.code==="privacy_suppressed","La API permitió recrear el correo anonimizado");
  const resubscribe=await request(`/api/v1/lists/${listId}/subscriptions`,json("POST",{email:survivorEmail,status:"active",source:"privacy_e2e",fields:{}}));
  assert(resubscribe.response.status===409&&resubscribe.body?.error?.code==="privacy_suppressed","La API de listas permitió reactivar el correo anonimizado");
  const publicSignup=await request("/api/public/subscribe",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({list_key:listKey,email:survivorEmail,fields:{},consent_text:"Intento público E2E"})});
  assert(publicSignup.response.status===202&&publicSignup.body.accepted===true,"El alta pública no respondió de forma no enumerable");
  const searchAfterPublic=(await api(`/api/v1/contacts?email=${encodeURIComponent(survivorEmail)}`)).body;
  assert(searchAfterPublic.data.length===0,"El alta pública volvió a crear el contacto protegido");

  const form=new FormData();form.append("file",new Blob([`email,first_name\n${survivorEmail},No debe volver\n`],{type:"text/csv"}),`privacy-${marker}.csv`);form.append("config",JSON.stringify({list_id:listId,mapping:{email:"email",first_name:"first_name"},delimiter:",",initial_status:"active",existing_policy:"overwrite",source:"privacy_e2e",consent_text:"Importación E2E"}));
  const imported=(await api("/api/v1/imports",{method:"POST",headers:{"Idempotency-Key":`privacy-import-${runId}`},body:form})).body;
  importJobId=imported.id;
  const importResult=await waitForImport(imported.id);
  assert(importResult.status==="completed"&&importResult.result.failed===1&&importResult.result.created===0,"La importación no rechazó el correo protegido");
  assert(importResult.rejections[0]?.email===""&&importResult.rejections[0]?.reason.includes("privacidad"),"El rechazo de importación conservó el correo privado o perdió el motivo");

  const suppressions=(await api(`/api/v1/suppressions?q=${encodeURIComponent(survivorEmail)}&status=any`)).body.data;
  const privacySuppression=suppressions.find(item=>item.reason==="privacy"&&item.status==="active");
  assert(privacySuppression,"No existe la supresión permanente de privacidad");
  const resolvePrivacy=await request(`/api/v1/suppressions/${privacySuppression.id}`,json("PATCH",{action:"resolve",note:"No debe permitirse"}));
  assert(resolvePrivacy.response.status===409&&resolvePrivacy.body?.error?.code==="protected_suppression","La supresión de privacidad se pudo resolver");
  const[sourceTombstone,targetTombstone,privacyCount,privateRows]=await Promise.all([
    sql`SELECT merged_into_contact_id,merged_at,email,first_name FROM contacts WHERE id=${sourceId}`.then(rows=>rows[0]),
    sql`SELECT anonymized_at,email,first_name,custom_fields FROM contacts WHERE id=${survivorId}`.then(rows=>rows[0]),
    sql`SELECT count(*)::int AS count FROM privacy_requests WHERE contact_id=${survivorId} AND status='completed'`.then(rows=>rows[0]),
    sql`SELECT count(*)::int AS count FROM outbound_messages WHERE id=${messageId} AND (to_email=${survivorEmail} OR subject ILIKE '%'||${survivorEmail}||'%' OR variables::text ILIKE '%'||${survivorEmail}||'%' OR metadata::text ILIKE '%'||${survivorEmail}||'%')`.then(rows=>rows[0]),
  ]);
  assert(sourceTombstone.merged_into_contact_id===survivorId&&sourceTombstone.email.endsWith("@invalid.local"),"El tombstone de fusión es incorrecto");
  assert(targetTombstone.anonymized_at&&targetTombstone.email.endsWith("@invalid.local")&&targetTombstone.first_name===""&&Object.keys(targetTombstone.custom_fields).length===0,"El tombstone de privacidad conserva identidad");
  assert(privacyCount.count>=2,"Exportación y anonimización no quedaron auditadas");
  assert(privateRows.count===0,"El mensaje todavía contiene el correo original");

  completed=true;
  console.log(JSON.stringify({ok:true,run_id:runId,list_id:listId,source_contact_id:sourceId,survivor_contact_id:survivorId,merge_id:merge.merge_id,privacy_request_id:anonymized.privacy_request_id,message_id:messageId,import_job_id:imported.id,invariants:{unsubscribe_survived_merge:true,export_audited:true,history_redacted:true,api_blocked:true,list_api_blocked:true,public_blocked:true,csv_blocked:true,suppression_permanent:true}},null,2));
}finally{
  if(completed){
    if(listId)await sql`UPDATE lists SET status='archived',archived_at=COALESCE(archived_at,now()),updated_at=now() WHERE id=${listId}`.catch(()=>{});
    if(apiKeyId)await sql`UPDATE api_keys SET revoked_at=now() WHERE id=${apiKeyId}`.catch(()=>{});
  }else{
    await sql.begin(async tx=>{
      if(importJobId)await tx`DELETE FROM background_jobs WHERE id=${importJobId}`;
      if(messageId)await tx`DELETE FROM outbound_messages WHERE id=${messageId}`;
      if(sourceId||survivorId){const ids=[sourceId,survivorId].filter(Boolean);await tx`DELETE FROM audit_log WHERE entity_id=ANY(${ids}::text[])`;await tx`DELETE FROM contact_merges WHERE source_contact_id=ANY(${ids}::uuid[]) OR survivor_contact_id=ANY(${ids}::uuid[])`;await tx`DELETE FROM privacy_requests WHERE contact_id=ANY(${ids}::uuid[])`;await tx`DELETE FROM contacts WHERE id=ANY(${ids}::uuid[])`;}
      await tx`DELETE FROM suppressions WHERE lower(email) IN (lower(${sourceEmail}),lower(${survivorEmail})) AND source IN('contact_merge','privacy_request')`;
      if(listId)await tx`DELETE FROM lists WHERE id=${listId}`;
      if(apiKeyId)await tx`DELETE FROM api_keys WHERE id=${apiKeyId}`;
    }).catch(error=>console.error(JSON.stringify({level:"error",event:"privacy_e2e_cleanup_failed",message:error instanceof Error?error.message:String(error)})));
  }
  await sql.end();
}
