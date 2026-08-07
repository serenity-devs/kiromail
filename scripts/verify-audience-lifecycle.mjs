import { createHash,randomBytes,randomUUID } from "node:crypto";
import postgres from "postgres";

const databaseUrl=process.env.DATABASE_URL;
if(!databaseUrl)throw new Error("DATABASE_URL es obligatoria");
const baseUrl=(process.env.VERIFY_BASE_URL??"http://localhost:3000").replace(/\/$/,"");
const sql=postgres(databaseUrl,{max:1});
const runId=randomUUID();const marker=runId.replaceAll("-","").slice(0,12);
const token=`sm_live_audience_${marker}_${randomBytes(32).toString("base64url")}`;
const secretHash=createHash("sha256").update(token).digest("hex");
let apiKeyId="",listId="",duplicateListId="",contactId="",campaignId="",segmentId="",duplicateSegmentId="",fieldId="",completed=false;

function assert(condition,message){if(!condition)throw new Error(message);}
async function request(path,options={}){const response=await fetch(`${baseUrl}${path}`,{...options,headers:{Authorization:`Bearer ${token}`,...(options.headers??{})}});const text=await response.text();let body;try{body=text?JSON.parse(text):null;}catch{body=text;}return{response,body};}
async function api(path,options={}){const result=await request(path,options);if(!result.response.ok)throw new Error(`${options.method??"GET"} ${path}: ${result.response.status} ${JSON.stringify(result.body)}`);return result.body;}
function json(method,body){return{method,headers:{"Content-Type":"application/json"},body:JSON.stringify(body)};}
async function mutate(path,method,body){const current=await request(path);assert(current.response.ok&&current.response.headers.get("etag"),`No se obtuvo ETag para ${path}`);return api(path,{method,headers:{...(body===undefined?{}:{"Content-Type":"application/json"}),"If-Match":current.response.headers.get("etag")},...(body===undefined?{}:{body:JSON.stringify(body)})});}

try{
  const[key]=await sql`INSERT INTO api_keys(name,prefix,secret_hash,scopes) VALUES('Audiencias E2E',${`audience_${marker}`},${secretHash},${["lists:read","lists:write","contacts:write","campaigns:read","campaigns:write"]}) RETURNING id`;apiKeyId=key.id;
  const list=await api("/api/v1/lists",json("POST",{key:`audience_e2e_${marker}`,name:`Audiencias E2E ${marker}`,description:"Ciclo de vida temporal",public_signup_enabled:true,double_opt_in:false,fields:[{key:"registration_date",label:"Fecha de registro",type:"date",visibility:"preference_center"},{key:"favorite_team",label:"Equipo preferido",type:"select",options:["Betis","Sevilla"]}]}));listId=list.id;
  const detail=await api(`/api/v1/lists/${listId}`);fieldId=detail.fields.find(item=>item.key==="favorite_team")?.id;assert(fieldId,"No se creó el campo a archivar");
  await mutate(`/api/v1/lists/${listId}/fields/${fieldId}`,"DELETE");
  const archivedField=await api(`/api/v1/lists/${listId}`);assert(archivedField.fields.find(item=>item.id===fieldId)?.status==="archived","El campo no quedó archivado");

  const subscription=await api(`/api/v1/lists/${listId}/subscriptions`,json("POST",{email:`audience-${marker}@example.test`,first_name:"Audiencia",status:"active",source:"audience_e2e",fields:{registration_date:"2026-08-04"}}));contactId=subscription.contact_id;
  const listCopy=await api(`/api/v1/lists/${listId}/duplicate`,json("POST",{}));duplicateListId=listCopy.id;
  const copyDetail=await api(`/api/v1/lists/${duplicateListId}`);
  assert(copyDetail.duplicated_from_id===listId,"La copia no conserva su procedencia");
  assert(copyDetail.public_signup_enabled===false,"La copia habilitó altas públicas sin revisión");
  assert(copyDetail.stats.total===0,"La copia arrastró suscriptores");
  assert(copyDetail.fields.length===1&&copyDetail.fields[0].key==="registration_date"&&copyDetail.fields[0].status==="active","La copia no limitó los campos a los activos");

  await mutate(`/api/v1/lists/${listId}/fields/${fieldId}`,"PATCH",{status:"active"});
  assert((await api(`/api/v1/lists/${listId}`)).fields.find(item=>item.id===fieldId)?.status==="active","El campo archivado no se restauró");
  await mutate(`/api/v1/lists/${listId}`,"DELETE");
  const restoredList=await mutate(`/api/v1/lists/${listId}`,"PATCH",{status:"active"});
  assert(restoredList.status==="active"&&restoredList.archived_at==null,"La lista no se restauró limpiamente");

  const campaign=await api("/api/v1/campaigns",json("POST",{name:`Campaña audiencia ${marker}`,list_id:listId,subject:"Ventana de interacción",content:{html:"<p>Verificación de audiencia</p>",text:"Verificación de audiencia"}}));campaignId=campaign.id;
  const definition={kind:"group",match:"all",children:[{kind:"rule",field:"campaign_activity",operator:"not_opened",value:campaignId,within_days:30}]};
  const segment=await api("/api/v1/segments",json("POST",{name:`Sin apertura reciente ${marker}`,description:"Ventana temporal E2E",list_id:listId,definition}));segmentId=segment.id;
  assert(segment.definition.children[0].within_days===30&&segment.preview.explanation.includes("últimos 30 días"),"El segmento perdió o no explicó la ventana temporal");
  const segmentCopy=await api(`/api/v1/segments/${segmentId}/duplicate`,json("POST",{}));duplicateSegmentId=segmentCopy.id;
  assert(segmentCopy.duplicated_from_id===segmentId&&segmentCopy.definition.children[0].within_days===30,"La copia del segmento perdió procedencia o ventana temporal");
  await mutate(`/api/v1/segments/${segmentId}`,"DELETE");
  const restoredSegment=await mutate(`/api/v1/segments/${segmentId}`,"PATCH",{status:"active"});
  assert(restoredSegment.status==="active"&&restoredSegment.archived_at==null,"El segmento no se restauró limpiamente");

  const[audits]=await sql`SELECT count(*)::int AS count FROM audit_log WHERE entity_id=ANY(${[listId,duplicateListId,segmentId,duplicateSegmentId,fieldId]}::text[]) AND action IN('duplicate','restore')`;
  assert(audits.count>=5,"Faltan trazas de duplicación o restauración");
  completed=true;
  console.log(JSON.stringify({ok:true,run_id:runId,list_id:listId,duplicate_list_id:duplicateListId,field_id:fieldId,campaign_id:campaignId,segment_id:segmentId,duplicate_segment_id:duplicateSegmentId,invariants:{active_fields_only:true,subscribers_not_copied:true,public_signup_disabled:true,list_restored:true,field_restored:true,segment_restored:true,interaction_window_preserved:true,audited:true}},null,2));
}finally{
  if(completed){
    if(segmentId||duplicateSegmentId)await sql`UPDATE segments SET status='archived',archived_at=COALESCE(archived_at,now()),updated_at=now() WHERE id=ANY(${[segmentId,duplicateSegmentId].filter(Boolean)}::uuid[])`.catch(()=>{});
    if(campaignId)await sql`UPDATE campaigns SET archived_at=COALESCE(archived_at,now()),updated_at=now() WHERE id=${campaignId}`.catch(()=>{});
    if(contactId)await sql`DELETE FROM contacts WHERE id=${contactId}`.catch(()=>{});
    if(listId||duplicateListId)await sql`UPDATE lists SET status='archived',archived_at=COALESCE(archived_at,now()),updated_at=now() WHERE id=ANY(${[listId,duplicateListId].filter(Boolean)}::uuid[])`.catch(()=>{});
    if(apiKeyId)await sql`UPDATE api_keys SET revoked_at=now() WHERE id=${apiKeyId}`.catch(()=>{});
  }else{
    await sql.begin(async tx=>{
      const segmentIds=[segmentId,duplicateSegmentId].filter(Boolean);if(segmentIds.length)await tx`DELETE FROM segments WHERE id=ANY(${segmentIds}::uuid[])`;
      if(campaignId)await tx`DELETE FROM campaigns WHERE id=${campaignId}`;
      if(contactId)await tx`DELETE FROM contacts WHERE id=${contactId}`;
      const listIds=[listId,duplicateListId].filter(Boolean);if(listIds.length)await tx`DELETE FROM lists WHERE id=ANY(${listIds}::uuid[])`;
      if(apiKeyId)await tx`DELETE FROM api_keys WHERE id=${apiKeyId}`;
    }).catch(error=>console.error(JSON.stringify({level:"error",event:"audience_e2e_cleanup_failed",message:error instanceof Error?error.message:String(error)})));
  }
  await sql.end();
}
