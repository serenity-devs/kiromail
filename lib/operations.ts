import { randomUUID } from "node:crypto";
import { env, productionConfigurationChecks } from "./config";
import { pruneExpiredContent, reconcileContentBlobs } from "./content-storage";
import { pruneJobFiles } from "./data-jobs";
import { sql } from "./db";
import { getDataQueue, getEmailQueue, getTransactionalQueue } from "./queue";

const queueMap={campaigns:getEmailQueue,transactional:getTransactionalQueue,data:getDataQueue} as const;
type QueueName=keyof typeof queueMap;

export async function queueCounts(){
  const entries=await Promise.all(Object.entries(queueMap).map(async([name,getQueue])=>[name,await getQueue().getJobCounts("wait","active","delayed","completed","failed")] as const));
  return Object.fromEntries(entries);
}

export async function writeWorkerHeartbeat(startedAt:Date){
  const queues=await queueCounts();
  await sql`INSERT INTO worker_heartbeats(service,instance_id,queues,metadata,started_at,heartbeat_at)VALUES('worker',${env.instanceId},${sql.json(queues)},${sql.json({pid:process.pid,node:process.version})},${startedAt},now())ON CONFLICT(service,instance_id)DO UPDATE SET queues=EXCLUDED.queues,metadata=EXCLUDED.metadata,heartbeat_at=now()`;
  return queues;
}

export async function recordDeadLetter(input:{queueName:QueueName;jobId:string;entityType:string;entityId:string;error:Error;attempts:number;payload?:Record<string,unknown>}){
  await sql`INSERT INTO dead_letter_items(queue_name,job_id,entity_type,entity_id,error,attempts,payload)VALUES(${input.queueName},${input.jobId},${input.entityType},${input.entityId},${input.error.message.slice(0,2000)},${input.attempts},${sql.json((input.payload??{}) as never)})ON CONFLICT(queue_name,job_id)DO UPDATE SET error=EXCLUDED.error,attempts=EXCLUDED.attempts,payload=EXCLUDED.payload,status='open',failed_at=now(),retried_at=NULL,resolved_at=NULL`;
}

async function beginOperationalRun(type:"retention"|"blob_reconciliation"){
  const [recent]=await sql<{id:string}[]>`SELECT id FROM operational_runs WHERE type=${type} AND status IN('running','completed') AND started_at>now()-interval '20 hours' ORDER BY started_at DESC LIMIT 1`;
  if(recent)return null;
  const[run]=await sql<{id:string}[]>`INSERT INTO operational_runs(type,status,instance_id)VALUES(${type},'running',${env.instanceId})RETURNING id`;
  return run.id;
}

export async function runRetentionMaintenance(){
  const runId=await beginOperationalRun("retention");if(!runId)return{skipped:true};
  try{
    const[settings]=await sql<{event_retention_days:number;audit_retention_days:number;import_retention_days:number;personal_data_retention_days:number}[]>`SELECT event_retention_days,audit_retention_days,import_retention_days,personal_data_retention_days FROM settings WHERE id=1`;
    const blobs=await pruneExpiredContent();
    const jobs=await pruneJobFiles(settings.import_retention_days);
    const[eventResult]=await sql`WITH removed AS(DELETE FROM email_events WHERE occurred_at<now()-(${settings.event_retention_days}*interval '1 day') RETURNING 1)SELECT count(*)::int AS count FROM removed`;
    const[auditResult]=await sql`WITH removed AS(DELETE FROM audit_log WHERE created_at<now()-(${settings.audit_retention_days}*interval '1 day') RETURNING 1)SELECT count(*)::int AS count FROM removed`;
    const[piiResult]=await sql`WITH sanitized AS(UPDATE consent_events SET ip=NULL,user_agent='' WHERE occurred_at<now()-(${settings.personal_data_retention_days}*interval '1 day') AND (ip IS NOT NULL OR user_agent<>'') RETURNING 1)SELECT count(*)::int AS count FROM sanitized`;
    const[authResult]=await sql`WITH removed AS(DELETE FROM auth_attempts WHERE attempted_at<now()-(${settings.personal_data_retention_days}*interval '1 day') RETURNING 1)SELECT count(*)::int AS count FROM removed`;
    await Promise.all([
      sql`DELETE FROM user_sessions WHERE expires_at<now()-interval '30 days'`,
      sql`DELETE FROM password_reset_tokens WHERE expires_at<now()-interval '30 days'`,
      sql`DELETE FROM request_metric_minutes WHERE minute<now()-interval '30 days'`,
      sql`DELETE FROM worker_heartbeats WHERE heartbeat_at<now()-interval '7 days'`,
      sql`DELETE FROM dead_letter_items WHERE status<>'open' AND COALESCE(resolved_at,retried_at,failed_at)<now()-interval '90 days'`,
    ]);
    const detail={blobs,jobs,events:Number(eventResult.count),audit:Number(auditResult.count),consent_pii:Number(piiResult.count),auth_attempts:Number(authResult.count)};
    await sql`UPDATE operational_runs SET status='completed',detail=${sql.json(detail)},completed_at=now() WHERE id=${runId}`;
    return detail;
  }catch(error){await sql`UPDATE operational_runs SET status='failed',error=${error instanceof Error?error.message.slice(0,2000):'Error desconocido'},completed_at=now() WHERE id=${runId}`;throw error;}
}

export async function runBlobReconciliation(){
  const runId=await beginOperationalRun("blob_reconciliation");if(!runId)return{skipped:true};
  try{const result=await reconcileContentBlobs();await sql`UPDATE operational_runs SET status=${result.missing.length||result.corrupted.length||result.unreadable.length?'failed':'completed'},detail=${sql.json(result)},completed_at=now() WHERE id=${runId}`;return result;}
  catch(error){await sql`UPDATE operational_runs SET status='failed',error=${error instanceof Error?error.message.slice(0,2000):'Error desconocido'},completed_at=now() WHERE id=${runId}`;throw error;}
}

export async function operationsDashboard(){
  const[queues,heartbeats,storage,runs,deadLetters,database]=await Promise.all([
    queueCounts(),
    sql`SELECT service,instance_id,queues,metadata,started_at,heartbeat_at,(heartbeat_at>now()-interval '60 seconds') AS healthy FROM worker_heartbeats ORDER BY heartbeat_at DESC`,
    sql`SELECT storage_backend,count(*)::int AS objects,COALESCE(sum(byte_size),0)::bigint AS bytes,count(*) FILTER(WHERE expires_at<=now())::int AS expired FROM content_blobs GROUP BY storage_backend`,
    sql`SELECT id,type,status,instance_id,detail,error,started_at,completed_at FROM operational_runs ORDER BY started_at DESC LIMIT 20`,
    sql`SELECT id,queue_name,job_id,entity_type,entity_id,error,attempts,payload,status,failed_at,retried_at,resolved_at FROM dead_letter_items ORDER BY failed_at DESC LIMIT 100`,
    sql`SELECT pg_database_size(current_database())::bigint AS bytes,current_database() AS name`,
  ]);
  return{configuration:productionConfigurationChecks(),queues,workers:heartbeats,storage,database:database[0],runs,dead_letters:deadLetters};
}

export async function retryDeadLetter(id:string){
  const[item]=await sql<{id:string;queue_name:QueueName;job_id:string;entity_type:string;entity_id:string;status:string}[]>`SELECT id,queue_name,job_id,entity_type,entity_id,status FROM dead_letter_items WHERE id=${id} FOR UPDATE`;
  if(!item||item.status!=="open")throw new Error("La incidencia ya no está abierta");
  const retryId=randomUUID();
  if(item.queue_name==="transactional"){
    const[message]=await sql<{id:string}[]>`UPDATE outbound_messages SET status='queued',failure_code=NULL,failure_reason=NULL,updated_at=now() WHERE id=${item.entity_id} AND status='failed' AND ses_message_id IS NULL RETURNING id`;
    if(!message)throw new Error("El mensaje ya fue aceptado o no se puede reintentar");
    await getTransactionalQueue().add("send",{messageId:message.id},{jobId:`transactional-${message.id}-dlq-${retryId}`});
  }else if(item.queue_name==="campaigns"){
    const[recipient]=await sql<{id:string;campaign_id:string;outbound_message_id:string|null}[]>`UPDATE campaign_recipients SET status='queued',processing_at=NULL,failure_reason=NULL,updated_at=now() WHERE id=${item.entity_id} AND status='failed' RETURNING id,campaign_id,outbound_message_id`;
    if(!recipient)throw new Error("El destinatario ya no se puede reintentar");
    await sql`UPDATE campaigns SET status='sending',completed_at=NULL,updated_at=now() WHERE id=${recipient.campaign_id} AND status IN('completed','failed','sending')`;
    await sql`UPDATE outbound_messages SET status='queued',failure_code=NULL,failure_reason=NULL,updated_at=now() WHERE id=${recipient.outbound_message_id} AND ses_message_id IS NULL`;
    await getEmailQueue().add("send",{recipientId:recipient.id},{jobId:`recipient-${recipient.id}-dlq-${retryId}`});
  }else{
    const[job]=await sql<{id:string}[]>`UPDATE background_jobs SET status='pending',error=NULL,completed_at=NULL,cancel_requested=false WHERE id=${item.entity_id} AND status='failed' RETURNING id`;
    if(!job)throw new Error("El trabajo de datos ya no se puede reintentar");
    await getDataQueue().add("retry",{jobId:job.id},{jobId:`data-${job.id}-dlq-${retryId}`});
  }
  await sql`UPDATE dead_letter_items SET status='retried',retried_at=now() WHERE id=${item.id}`;
  return{retried:true};
}

export async function resolveDeadLetter(id:string){
  const[item]=await sql<{id:string}[]>`UPDATE dead_letter_items SET status='resolved',resolved_at=now() WHERE id=${id} AND status='open' RETURNING id`;
  if(!item)throw new Error("La incidencia ya no está abierta");
  return{resolved:true};
}
