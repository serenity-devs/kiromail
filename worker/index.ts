import { Worker } from "bullmq";
import { redisConnection } from "../lib/queue";
import { markRecipientFailed, recoverQueuedRecipients, releaseRecipientForRetry, scheduleDueCampaigns, sendRecipient } from "../lib/campaign-service";
import { markTransactionalFailed, recoverQueuedTransactionalMessages, releaseTransactionalForRetry, sendTransactionalMessage } from "../lib/transactional-service";
import { deliverPendingWebhooks } from "../lib/webhooks";
import { processDataJob, recoverDataJobs } from "../lib/data-jobs";
import { evaluateDueCampaignExperiments,recoverCampaignExperiments } from "../lib/campaign-experiments";
import { runDeliverabilityMaintenance } from "../lib/deliverability";
import { recordDeadLetter,runBlobReconciliation,runRetentionMaintenance,writeWorkerHeartbeat } from "../lib/operations";
import { log } from "../lib/logger";

const workerStartedAt=new Date();

const worker = new Worker<{ recipientId: string }>(
  "kiromail-email",
  async (job) => sendRecipient(job.data.recipientId),
  {
    connection: redisConnection,
    concurrency: Number(process.env.WORKER_CONCURRENCY ?? 5),
    limiter: {
      max: Number(process.env.SEND_RATE_PER_SECOND ?? 10),
      duration: 1000,
    },
  },
);

const transactionalWorker = new Worker<{ messageId: string }>(
  "kiromail-transactional",
  async (job) => sendTransactionalMessage(job.data.messageId),
  {
    connection: redisConnection,
    concurrency: Number(process.env.TRANSACTIONAL_WORKER_CONCURRENCY ?? 4),
    limiter: {
      max: Number(process.env.TRANSACTIONAL_SEND_RATE_PER_SECOND ?? 2),
      duration: 1000,
    },
  },
);

const dataWorker = new Worker<{ jobId: string }>(
  "kiromail-data",
  async (job) => processDataJob(job.data.jobId),
  { connection: redisConnection, concurrency: Number(process.env.DATA_WORKER_CONCURRENCY ?? 1) },
);

worker.on("completed", (job) => log("info","campaign_recipient_sent",{recipient_id:job.data.recipientId,job_id:job.id}));
worker.on("failed", async (job, error) => {
  log("error","campaign_recipient_failed",{recipient_id:job?.data.recipientId,job_id:job?.id,attempts:job?.attemptsMade,error:error.message});
  if(job){if(job.attemptsMade >= (job.opts.attempts ?? 1)){await markRecipientFailed(job.data.recipientId,error);await recordDeadLetter({queueName:"campaigns",jobId:String(job.id),entityType:"campaign_recipient",entityId:job.data.recipientId,error,attempts:job.attemptsMade});}else await releaseRecipientForRetry(job.data.recipientId,error);}
});
transactionalWorker.on("completed", (job,result) => log("info",result?.skipped?"transactional_message_skipped":"transactional_message_sent",{message_id:job.data.messageId,job_id:job.id,paused:result?.paused??false}));
transactionalWorker.on("failed", async (job, error) => {
  log("error","transactional_message_failed",{message_id:job?.data.messageId,job_id:job?.id,attempts:job?.attemptsMade,error:error.message});
  if (job){if(job.attemptsMade >= (job.opts.attempts ?? 1)){await markTransactionalFailed(job.data.messageId, error);await recordDeadLetter({queueName:"transactional",jobId:String(job.id),entityType:"outbound_message",entityId:job.data.messageId,error,attempts:job.attemptsMade});}else await releaseTransactionalForRetry(job.data.messageId,error);}
});
dataWorker.on("completed", (job) => log("info","data_job_completed",{data_job_id:job.data.jobId,job_id:job.id}));
dataWorker.on("failed", async(job,error) => {log("error","data_job_failed",{data_job_id:job?.data.jobId,job_id:job?.id,attempts:job?.attemptsMade,error:error.message});if(job&&job.attemptsMade>=(job.opts.attempts??1))await recordDeadLetter({queueName:"data",jobId:String(job.id),entityType:"background_job",entityId:job.data.jobId,error,attempts:job.attemptsMade});});

await recoverQueuedRecipients();
await recoverQueuedTransactionalMessages({includeFresh:true});
await recoverDataJobs();
await scheduleDueCampaigns();
await recoverCampaignExperiments();
await evaluateDueCampaignExperiments();
await runDeliverabilityMaintenance().catch(error=>console.error("Deliverability health check failed",error));
await writeWorkerHeartbeat(workerStartedAt).catch(error=>log("error","worker_heartbeat_failed",{error:error instanceof Error?error.message:"unknown"}));
await runRetentionMaintenance().catch(error=>log("error","retention_maintenance_failed",{error:error instanceof Error?error.message:"unknown"}));
await runBlobReconciliation().catch(error=>log("error","blob_reconciliation_failed",{error:error instanceof Error?error.message:"unknown"}));
const scheduleTimer = setInterval(()=>{scheduleDueCampaigns().catch(error=>console.error("Campaign schedule poll failed",error));recoverCampaignExperiments().then(evaluateDueCampaignExperiments).catch(error=>console.error("Experiment evaluation poll failed",error));}, 15_000);
const webhookTimer = setInterval(() => deliverPendingWebhooks().catch((error)=>console.error("Webhook delivery poll failed",error)), 5_000);
const deliverabilityTimer=setInterval(()=>runDeliverabilityMaintenance().catch(error=>console.error("Deliverability health check failed",error)),60*60_000);
const suppressionSyncTimer=setInterval(()=>runDeliverabilityMaintenance({syncSuppressions:true}).catch(error=>console.error("SES suppression sync failed",error)),24*60*60_000);
const heartbeatTimer=setInterval(()=>writeWorkerHeartbeat(workerStartedAt).catch(error=>log("error","worker_heartbeat_failed",{error:error instanceof Error?error.message:"unknown"})),15_000);
const retentionTimer=setInterval(()=>runRetentionMaintenance().catch(error=>log("error","retention_maintenance_failed",{error:error instanceof Error?error.message:"unknown"})),60*60_000);
const reconciliationTimer=setInterval(()=>runBlobReconciliation().catch(error=>log("error","blob_reconciliation_failed",{error:error instanceof Error?error.message:"unknown"})),60*60_000);
const transactionalRecoveryTimer=setInterval(()=>recoverQueuedTransactionalMessages().catch(error=>log("error","transactional_recovery_failed",{error:error instanceof Error?error.message:"unknown"})),60_000);

async function shutdown() {
  clearInterval(scheduleTimer);
  clearInterval(webhookTimer);
  clearInterval(deliverabilityTimer);
  clearInterval(suppressionSyncTimer);
  clearInterval(heartbeatTimer);
  clearInterval(retentionTimer);
  clearInterval(reconciliationTimer);
  clearInterval(transactionalRecoveryTimer);
  await Promise.all([worker.close(), transactionalWorker.close(), dataWorker.close()]);
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
log("info","worker_ready",{instance_id:process.env.INSTANCE_ID??process.env.HOSTNAME??"local"});
