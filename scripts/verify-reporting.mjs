const base=process.env.APP_URL??"http://localhost:3000";const runId=crypto.randomUUID();
function assert(condition,message){if(!condition)throw new Error(message);}
async function login(){const response=await fetch(`${base}/api/auth/login`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:process.env.ADMIN_EMAIL??"admin@kiromail.local",password:process.env.ADMIN_PASSWORD??"kiromail-local-2026"})});assert(response.ok,`Login ${response.status}`);const cookie=response.headers.get("set-cookie")?.split(";")[0];assert(cookie,"El login no devolvió cookie");return cookie;}
const cookie=await login();
async function request(path,options={}){const response=await fetch(`${base}${path}`,{...options,headers:{Cookie:cookie,...options.headers}});const contentType=response.headers.get("content-type")??"";let bytes;let body;if(contentType.includes("json"))body=await response.json();else{bytes=new Uint8Array(await response.arrayBuffer());body=new TextDecoder().decode(bytes);}assert(response.ok,`${path}: ${response.status} ${typeof body==="string"?body:JSON.stringify(body)}`);return{response,body,bytes};}

const from="2020-01-01T00:00:00.000Z";const to=new Date(Date.now()+86400_000).toISOString();
const campaignOverview=(await request(`/api/v1/reports/campaigns?from=${from}&to=${encodeURIComponent(to)}`)).body;
assert(Array.isArray(campaignOverview.campaigns)&&campaignOverview.summary&&campaignOverview.benchmarks,"El informe de campañas está incompleto");
const target=campaignOverview.campaigns.find(item=>item.total_recipients>0);assert(target,"No existe una campaña con destinatarios para verificar");
const detailBefore=(await request(`/api/v1/campaigns/${target.id}/report?limit=50`)).body;
assert(detailBefore.summary&&Array.isArray(detailBefore.timeline)&&Array.isArray(detailBefore.links)&&Array.isArray(detailBefore.recipients),"El detalle de campaña está incompleto");
assert(detailBefore.summary.unique_opens<=detailBefore.summary.delivered&&detailBefore.summary.unique_clicks<=detailBefore.summary.delivered,"Las métricas únicas no son coherentes");
assert(detailBefore.content_preview_url,"El informe no enlaza el HTML exacto");
const preview=await request(detailBefore.content_preview_url);assert(preview.response.headers.get("content-type")?.includes("text/html"),"La previsualización no es HTML");

const recipient=detailBefore.recipients[0];assert(recipient,"No se devolvió ningún destinatario");const automatedBefore=detailBefore.summary.automated_clicks;const trackedUrl=`https://example.com/reporting-bot-${runId}`;
const tracking=await fetch(`${base}/t/click/${recipient.id}?url=${encodeURIComponent(trackedUrl)}`,{redirect:"manual",headers:{"User-Agent":"Proofpoint URL Defense Scanner E2E","Purpose":"prefetch"}});assert([301,302,303,307,308].includes(tracking.status),`El tracker no redirigió: ${tracking.status}`);
const detailAfter=(await request(`/api/v1/campaigns/${target.id}/report?limit=50`)).body;assert(detailAfter.summary.automated_clicks===automatedBefore+1,"El clic de escáner no quedó clasificado como automatizado");

for(const kind of ["recipients","events","links"]){const exported=await request(`/api/v1/campaigns/${target.id}/report/export?kind=${kind}`);assert(exported.response.headers.get("content-type")?.includes("text/csv")&&exported.bytes?.[0]===0xef&&exported.bytes?.[1]===0xbb&&exported.bytes?.[2]===0xbf,`La exportación ${kind} no es CSV UTF-8 con BOM`);if(kind==="events")assert(exported.body.includes(trackedUrl)&&exported.body.includes('"sí"'),"La exportación no conserva el evento automatizado bruto");}
const transactional=(await request(`/api/v1/reports/transactional?from=${from}&to=${encodeURIComponent(to)}`)).body;assert(transactional.summary&&Array.isArray(transactional.daily)&&Array.isArray(transactional.templates),"El informe transaccional está incompleto");
const audience=(await request(`/api/v1/reports/audience?from=${from}&to=${encodeURIComponent(to)}`)).body;assert(audience.summary&&Array.isArray(audience.daily)&&Array.isArray(audience.lists),"El informe de audiencia está incompleto");
for(const channel of ["campaigns","transactional","audience"]){const exported=await request(`/api/v1/reports/${channel}?from=${from}&to=${encodeURIComponent(to)}&format=csv`);assert(exported.response.headers.get("content-type")?.includes("text/csv")&&exported.bytes?.[0]===0xef&&exported.bytes?.[1]===0xbb&&exported.bytes?.[2]===0xbf,`El resumen CSV ${channel} no es válido`);}

console.log(JSON.stringify({runId,campaign_id:target.id,campaigns:campaignOverview.summary.campaigns,detail:{total:detailAfter.summary.total,delivered:detailAfter.summary.delivered,unique_opens:detailAfter.summary.unique_opens,unique_clicks:detailAfter.summary.unique_clicks,automated_clicks:detailAfter.summary.automated_clicks,links:detailAfter.links.length},transactional:transactional.summary,audience:audience.summary,exports:6},null,2));
