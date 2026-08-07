import assert from "node:assert/strict";
import {createHash,randomBytes,randomUUID} from "node:crypto";
import {rm} from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

const base=(process.env.VERIFY_BASE_URL??"http://localhost:3000").replace(/\/$/,"");
const sql=postgres(process.env.DATABASE_URL,{max:4});
const runId=randomUUID(),marker=runId.replaceAll("-","").slice(0,16);
const token=`sm_live_load_${marker}_${randomBytes(32).toString("base64url")}`;
const results=[];let apiKeyId="",listId="",cookie="";
const transactionalCount=30,contactCount=100_000;

function percentile(values,p){const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.max(0,Math.ceil(sorted.length*p)-1)];}
async function fetchMeasured(url,options={}){const started=performance.now();const response=await fetch(`${base}${url}`,options);await response.arrayBuffer();return{status:response.status,ms:performance.now()-started};}
async function benchmark(name,total,concurrency,request,threshold){
  for(let i=0;i<Math.min(5,total);i++)assert.equal((await request(i,true)).status,200,`${name}: warmup falló`);
  const times=[];let next=0;await Promise.all(Array.from({length:concurrency},async()=>{while(true){const index=next++;if(index>=total)return;const sample=await request(index,false);assert.equal(sample.status,200,`${name}: HTTP ${sample.status}`);times.push(sample.ms);}}));
  const summary={name,requests:total,concurrency,p50_ms:Number(percentile(times,.5).toFixed(1)),p95_ms:Number(percentile(times,.95).toFixed(1)),max_ms:Number(Math.max(...times).toFixed(1)),threshold_ms:threshold,passed:percentile(times,.95)<threshold};results.push(summary);assert.ok(summary.passed,`${name}: p95 ${summary.p95_ms} ms >= ${threshold} ms`);
}
async function waitUntil(check,label,timeout=30_000){const end=Date.now()+timeout;while(Date.now()<end){if(await check())return;await new Promise(resolve=>setTimeout(resolve,250));}throw new Error(`Timeout esperando ${label}`);}

try{
  const[key]=await sql`INSERT INTO api_keys(name,prefix,secret_hash,scopes)VALUES('Carga E2E',${`load_${marker}`},${createHash("sha256").update(token).digest("hex")},${["contacts:read","lists:read","transactional:send"]})RETURNING id`;apiKeyId=key.id;
  const[list]=await sql`INSERT INTO lists(key,name,description,double_opt_in)VALUES(${`load_${marker}`},${`Carga 100k ${marker}`},'Conjunto temporal de rendimiento',false)RETURNING id`;listId=list.id;
  await sql`INSERT INTO contacts(email,first_name,last_name,status,source,created_at)SELECT ${`load-${marker}-`}||n||'@example.test','Carga',n::text,'active',${`load_e2e_${marker}`},now()-(n*interval '1 millisecond') FROM generate_series(1,${contactCount}) AS n`;
  await sql`INSERT INTO subscriptions(contact_id,list_id,status,source,custom_values,subscribed_at,confirmed_at,consent_text)SELECT id,${listId},'active','load_e2e','{}',now(),now(),'Prueba local de rendimiento' FROM contacts WHERE source=${`load_e2e_${marker}`}`;
  const bearer={Authorization:`Bearer ${token}`};

  const login=await fetch(`${base}/api/auth/login`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:process.env.ADMIN_EMAIL??"admin@serenity.local",password:process.env.ADMIN_PASSWORD??"serenity-local-2026"})});assert.equal(login.status,200,"Login de carga fallido");cookie=login.headers.get("set-cookie")?.split(";")[0]??"";

  await benchmark("contact_list_100k",50,10,()=>fetchMeasured("/api/v1/contacts?limit=50",{headers:bearer}),500);
  await benchmark("subscription_list_100k",50,10,()=>fetchMeasured(`/api/v1/lists/${listId}/subscriptions?limit=50`,{headers:bearer}),500);
  await benchmark("list_summary_100k",50,10,()=>fetchMeasured("/api/v1/lists",{headers:bearer}),500);
  await benchmark("admin_bootstrap_100k",15,3,()=>fetchMeasured("/api/bootstrap",{headers:{Cookie:cookie}}),2_000);

  const[settings]=await sql`SELECT transactional_reserved_rate FROM settings WHERE id=1`;const reservedRate=Math.max(1,Number(settings.transactional_reserved_rate));const acceptance=[];
  await Promise.all(Array.from({length:transactionalCount},async(_,index)=>{await new Promise(resolve=>setTimeout(resolve,index*(1000/reservedRate)));const started=performance.now();const response=await fetch(`${base}/api/v1/transactional/send`,{method:"POST",headers:{...bearer,"Content-Type":"application/json","Idempotency-Key":`load-${runId}-${index}`},body:JSON.stringify({to:{email:`load-transactional-${marker}-${index}@example.test`},subject:`Carga transaccional ${index}`,html:`<p>Mensaje de carga ${runId} / ${index}</p>`,text:`Mensaje de carga ${runId} / ${index}`,metadata:{load_run_id:runId,index}})});await response.arrayBuffer();assert.equal(response.status,202,`Aceptación transaccional ${index}: HTTP ${response.status}`);acceptance.push(performance.now()-started);}));
  const acceptanceSummary={name:"transactional_durable_acceptance",requests:transactionalCount,arrival_rate_per_second:reservedRate,p50_ms:Number(percentile(acceptance,.5).toFixed(1)),p95_ms:Number(percentile(acceptance,.95).toFixed(1)),max_ms:Number(Math.max(...acceptance).toFixed(1)),threshold_ms:500,passed:percentile(acceptance,.95)<500};results.push(acceptanceSummary);assert.ok(acceptanceSummary.passed,`Aceptación transaccional p95 ${acceptanceSummary.p95_ms} ms`);

  await waitUntil(async()=>{const[row]=await sql`SELECT count(*)::int AS count FROM outbound_messages WHERE metadata->>'load_run_id'=${runId} AND status NOT IN('accepted','queued','processing')`;return row.count===transactionalCount;},"primer intento transaccional",45_000);
  const attempts=await sql`SELECT extract(epoch FROM (min(a.started_at)-m.accepted_at))*1000 AS milliseconds FROM outbound_messages m JOIN message_send_attempts a ON a.message_id=m.id WHERE m.metadata->>'load_run_id'=${runId} GROUP BY m.id,m.accepted_at`;
  const attemptTimes=attempts.map(row=>Number(row.milliseconds));const attemptSummary={name:"transactional_first_attempt_at_reserved_capacity",messages:attemptTimes.length,arrival_rate_per_second:reservedRate,p50_ms:Number(percentile(attemptTimes,.5).toFixed(1)),p95_ms:Number(percentile(attemptTimes,.95).toFixed(1)),max_ms:Number(Math.max(...attemptTimes).toFixed(1)),threshold_ms:5_000,passed:attemptTimes.length===transactionalCount&&percentile(attemptTimes,.95)<5_000};results.push(attemptSummary);assert.ok(attemptSummary.passed,`Primer intento transaccional p95 ${attemptSummary.p95_ms} ms`);

  console.log(JSON.stringify({ok:true,run_id:runId,dataset:{contacts:contactCount,subscriptions:contactCount,transactional_messages:transactionalCount},results},null,2));
}finally{
  try{
    const candidates=await sql`SELECT DISTINCT b.id,b.storage_backend,b.storage_key FROM outbound_messages m CROSS JOIN LATERAL unnest(ARRAY[m.html_blob_id,m.text_blob_id,m.mime_blob_id]) blob_id JOIN content_blobs b ON b.id=blob_id WHERE m.metadata->>'load_run_id'=${runId}`;
    await sql.begin(async tx=>{await tx`DELETE FROM outbound_messages WHERE metadata->>'load_run_id'=${runId}`;if(listId)await tx`DELETE FROM lists WHERE id=${listId}`;await tx`DELETE FROM contacts WHERE source=${`load_e2e_${marker}`}`;if(apiKeyId)await tx`DELETE FROM api_keys WHERE id=${apiKeyId}`;});
    for(const blob of candidates){const[references]=await sql`SELECT EXISTS(SELECT 1 FROM outbound_messages WHERE html_blob_id=${blob.id} OR text_blob_id=${blob.id} OR mime_blob_id=${blob.id}) OR EXISTS(SELECT 1 FROM message_attachments WHERE blob_id=${blob.id}) AS used`;if(references.used)continue;await sql`DELETE FROM content_blobs WHERE id=${blob.id}`;if(blob.storage_backend==="filesystem"){const root=path.resolve(process.env.CONTENT_STORAGE_DIR??"./message-content");const target=path.resolve(root,blob.storage_key);if(target.startsWith(`${root}${path.sep}`))await rm(target,{force:true});}}
  }catch(error){console.error(JSON.stringify({level:"error",event:"performance_cleanup_failed",run_id:runId,message:error instanceof Error?error.message:String(error)}));}
  await sql.end();
}
