import assert from "node:assert/strict";
import postgres from "postgres";

const base=process.env.BASE_URL??"http://localhost:3000";
const runId=crypto.randomUUID();
const sql=postgres(process.env.DATABASE_URL,{max:1});
let cookie="";
const created={list:null,field:null,subscription:null,contact:null,segment:null,template:null,block:null,suppression:null,webhook:null};

async function request(path,options={}){
  const headers=new Headers(options.headers);if(cookie)headers.set("Cookie",cookie);
  const response=await fetch(`${base}${path}`,{...options,headers});
  const body=response.status===304?null:await response.json().catch(()=>({}));
  return{response,body,etag:response.headers.get("etag")};
}
async function api(path,options={},status){const result=await request(path,options);assert.equal(result.response.status,status??(options.method==="POST"?201:200),`${options.method??"GET"} ${path}: ${result.response.status} ${JSON.stringify(result.body)}`);return result;}
const json=(method,body,headers={})=>({method,headers:{"Content-Type":"application/json",...headers},body:JSON.stringify(body)});

async function verifyVersioned(path,patchBody,label){
  const first=await api(path);assert.ok(first.etag,`${label}: GET sin ETag`);assert.equal(first.body.etag,first.etag,`${label}: cabecera y cuerpo difieren`);
  const cached=await request(path,{headers:{"If-None-Match":first.etag}});assert.equal(cached.response.status,304,`${label}: If-None-Match no produjo 304`);
  const missing=await request(path,json("PATCH",patchBody));assert.equal(missing.response.status,428,`${label}: faltó 428 sin If-Match`);assert.equal(missing.body.error.code,"precondition_required");
  const updated=await api(path,json("PATCH",patchBody,{"If-Match":first.etag}),200);assert.notEqual(updated.etag,first.etag,`${label}: la revisión no avanzó`);
  const stale=await request(path,json("PATCH",patchBody,{"If-Match":first.etag}));assert.equal(stale.response.status,412,`${label}: un escritor obsoleto no recibió 412`);assert.equal(stale.body.error.code,"precondition_failed");
  return updated;
}

try{
  const login=await request("/api/auth/login",json("POST",{email:process.env.ADMIN_EMAIL??"admin@kiromail.local",password:process.env.ADMIN_PASSWORD??"kiromail-local-2026"}));assert.equal(login.response.status,200,"Login fallido");cookie=login.response.headers.get("set-cookie")?.split(";")[0]??"";assert.ok(cookie,"El login no devolvió cookie");

  const list=(await api("/api/v1/lists",json("POST",{key:`etag_${runId.replaceAll("-","").slice(0,16)}`,name:`ETag E2E ${runId.slice(0,8)}`,double_opt_in:false}),201)).body;created.list=list.id;
  const listUpdated=await verifyVersioned(`/api/v1/lists/${list.id}`,{description:`Escritor A ${runId}`},"lista");
  const listAfter=await api(`/api/v1/lists/${list.id}`);assert.equal(listAfter.body.description,`Escritor A ${runId}`,"La escritura obsoleta alteró la lista");

  const field=(await api(`/api/v1/lists/${list.id}/fields`,json("POST",{key:"equipo",label:"Equipo",type:"select",options:["Norte","Sur"]}),201)).body;created.field=field.id;
  await verifyVersioned(`/api/v1/lists/${list.id}/fields/${field.id}`,{help_text:"Actualización protegida"},"campo de lista");

  const subscription=(await api(`/api/v1/lists/${list.id}/subscriptions`,json("POST",{email:`etag-${runId}@example.com`,first_name:"Concurrencia",fields:{equipo:"Norte"},status:"active",source:"http_concurrency_e2e",consent_text:"Prueba E2E controlada"}),201)).body;created.subscription=subscription.id;created.contact=subscription.contact_id;
  await verifyVersioned(`/api/v1/lists/${list.id}/subscriptions/${subscription.id}`,{fields:{equipo:"Sur"}},"suscripción");
  await verifyVersioned(`/api/v1/contacts/${subscription.contact_id}`,{first_name:"Escritor A"},"contacto");

  const segment=(await api("/api/v1/segments",json("POST",{name:`Segmento ETag ${runId.slice(0,8)}`,description:"Inicial",list_id:list.id,definition:{kind:"group",match:"all",children:[{kind:"rule",field:"subscription_status",operator:"is",value:"active"}]}}),201)).body;created.segment=segment.id;
  await verifyVersioned(`/api/v1/segments/${segment.id}`,{status:"active"},"segmento");

  const template=(await api("/api/v1/templates",json("POST",{key:`etag_tpl_${runId.replaceAll("-","").slice(0,12)}`,name:`Plantilla ETag ${runId.slice(0,8)}`,channel:"transactional",subject:"Concurrencia",html:"<h1>Concurrencia</h1>",text:"Concurrencia"}),201)).body;created.template=template.id;
  await verifyVersioned(`/api/v1/templates/${template.id}`,{folder:"protegida"},"plantilla");

  const block=(await api("/api/v1/reusable-blocks",json("POST",{name:`Bloque ETag ${runId.slice(0,8)}`,block_document:{id:crypto.randomUUID(),type:"heading",content:"Bloque protegido"}}),201)).body;created.block=block.id;
  await verifyVersioned(`/api/v1/reusable-blocks/${block.id}`,{description:"Escritor A"},"bloque reutilizable");

  const suppression=(await api("/api/v1/suppressions",json("POST",{email:`suppression-${runId}@example.com`,reason:"manual",scope:"marketing",note:"E2E"}),201)).body;created.suppression=suppression.id;
  await verifyVersioned(`/api/v1/suppressions/${suppression.id}`,{action:"resolve",note:"Escritor A"},"supresión");

  const webhook=(await api("/api/v1/webhooks",json("POST",{name:`Webhook ETag ${runId.slice(0,8)}`,url:`https://example.com/kiromail-${runId}`,events:["message.delivered"]}),201)).body;created.webhook=webhook.id;
  await verifyVersioned(`/api/v1/webhooks/${webhook.id}`,{status:"disabled"},"webhook");

  const openapi=await api("/api/openapi");const listPatch=openapi.body.paths["/api/v1/lists/{id}"].patch;assert.ok(listPatch.parameters.some(item=>item.name==="If-Match"&&item.required),"OpenAPI no exige If-Match");assert.ok(listPatch.responses["412"]&&listPatch.responses["428"],"OpenAPI no documenta precondiciones");
  console.log(JSON.stringify({run_id:runId,verified:["304","428","atomic_412","list","field","subscription","contact","segment","template","reusable_block","suppression","webhook","openapi"],first_list_etag:list.etag,updated_list_etag:listUpdated.etag},null,2));
}finally{
  try{await sql.begin(async tx=>{if(created.webhook)await tx`DELETE FROM webhook_endpoints WHERE id=${created.webhook}`;if(created.suppression)await tx`DELETE FROM suppressions WHERE id=${created.suppression}`;if(created.block)await tx`DELETE FROM reusable_blocks WHERE id=${created.block}`;if(created.template)await tx`DELETE FROM templates WHERE id=${created.template}`;if(created.segment)await tx`DELETE FROM segments WHERE id=${created.segment}`;if(created.list)await tx`DELETE FROM lists WHERE id=${created.list}`;if(created.contact)await tx`DELETE FROM contacts WHERE id=${created.contact}`;});}finally{await sql.end();}
}
