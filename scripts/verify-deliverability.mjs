const base=process.env.APP_URL??"http://localhost:3100";const mailpit=process.env.MAILPIT_URL??"http://localhost:8026";const runId=crypto.randomUUID();let cookie="";let paused=false;
function assert(condition,message){if(!condition)throw new Error(message);}
async function login(){const response=await fetch(`${base}/api/auth/login`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:process.env.ADMIN_EMAIL??"admin@kiromail.local",password:process.env.ADMIN_PASSWORD??"kiromail-local-2026"})});assert(response.ok,`Login ${response.status}`);cookie=response.headers.get("set-cookie")?.split(";")[0]??"";assert(cookie,"Falta cookie de sesión");}
async function request(path,options={}){const response=await fetch(`${base}${path}`,{...options,headers:{Cookie:cookie,...(options.body?{"Content-Type":"application/json"}:{}),...options.headers}});const body=await response.json().catch(()=>({}));return{response,body};}
async function api(path,options={}){const result=await request(path,options);assert(result.response.ok,`${path}: ${result.response.status} ${JSON.stringify(result.body)}`);return result.body;}
async function action(payload){return api("/api/v1/deliverability/actions",{method:"POST",body:JSON.stringify(payload)});}

try{
  await login();
  const initial=await api("/api/v1/deliverability?refresh=true");
  assert(initial.mode.local&&initial.mode.transport==="smtp","El entorno Docker no aparece como Mailpit local");
  assert(initial.health.status==="local"&&initial.health.checks.some(item=>item.key==="local_transport"),"Falta el diagnóstico explícito de Mailpit");
  assert(initial.mode.environment_override===null,"Un valor vacío de MAIL_TRANSPORT no debe ocultar la configuración persistida");
  const testEmail=`deliverability-test-${runId}@example.com`;const technical=await action({action:"send_test",email:testEmail});
  assert(technical.data.sent&&technical.data.transport==="smtp"&&technical.data.provider_message_id,"La prueba técnica local no devolvió diagnóstico");
  const mailbox=await fetch(`${mailpit}/api/v1/messages`).then(response=>response.json());
  assert(mailbox.messages?.some(message=>message.To?.some?.(recipient=>recipient.Address===testEmail)||message.Subject?.startsWith("[KiroMail] Prueba técnica")),"Mailpit no contiene la prueba técnica");
  const pausedResult=await action({action:"set_sending_paused",paused:true,reason:`E2E ${runId}`});paused=true;assert(pausedResult.dashboard.mode.sending_paused,"La pausa global no quedó activa");
  const blocked=await request("/api/v1/transactional/send",{method:"POST",headers:{"Idempotency-Key":`paused-${runId}`},body:JSON.stringify({to:{email:`paused-${runId}@example.com`},subject:"No debe aceptarse",html:"<p>Pausa activa</p>"})});
  assert(blocked.response.status===503&&blocked.body.error?.code==="sending_paused","La pausa global no bloqueó la aceptación transaccional");
  const resumed=await action({action:"set_sending_paused",paused:false,reason:`Fin E2E ${runId}`});paused=false;assert(!resumed.dashboard.mode.sending_paused,"La reanudación no quedó activa");
  const accepted=await api("/api/v1/transactional/send",{method:"POST",headers:{"Idempotency-Key":`resumed-${runId}`},body:JSON.stringify({to:{email:`resumed-${runId}@example.com`},subject:`Entregabilidad E2E ${runId}`,html:`<p>Envío reanudado ${runId}</p>`,metadata:{e2e:"deliverability",run_id:runId}})});
  let delivered=false;for(let attempt=0;attempt<40;attempt++){const detail=await api(`/api/v1/transactional/messages/${accepted.id}`);if(detail.status==="delivered"){delivered=true;break;}await new Promise(resolve=>setTimeout(resolve,250));}assert(delivered,"El mensaje no se entregó tras reanudar");
  const final=await api("/api/v1/deliverability");assert(final.reputation.thirty_days.all.sent>=1&&Array.isArray(final.reputation.trend)&&Array.isArray(final.suppressions.summary),"El panel final no contiene reputación y supresiones");
  const openapi=await api("/api/openapi");assert(openapi.paths["/api/v1/deliverability"]&&openapi.paths["/api/events/ses"],"OpenAPI no documenta entregabilidad y SES/SNS");
  console.log(JSON.stringify({ok:true,run_id:runId,mode:final.mode,health:final.health.status,technical_test:{message_id:technical.data.provider_message_id,elapsed_ms:technical.data.elapsed_ms},pause_block_status:blocked.response.status,resumed_message_id:accepted.id,reputation_30_days:final.reputation.thirty_days.all,checks:final.health.checks.length,openapi_paths:Object.keys(openapi.paths).length},null,2));
}finally{if(paused&&cookie)await action({action:"set_sending_paused",paused:false,reason:`Recuperación finally E2E ${runId}`}).catch(()=>undefined);}
