import { randomUUID } from "node:crypto";
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import nodemailer from "nodemailer";
import { sql } from "./db";
import { env } from "./config";
import { buildSegmentFilter, type SegmentGroup, type SegmentParameter, type SegmentRule } from "./segments";
import { buildTrackedHtml, eventKey, personalize, withCampaignTemplateVariables } from "./email";
import { getEmailQueue } from "./queue";
import { storeContent } from "./content-storage";
import { issuePublicToken } from "./public-preferences";
import { advanceCampaignExperiment,buildExperimentAssignments,getCampaignExperimentSetup,markExperimentSampling } from "./campaign-experiments";
import { assertSendingAvailable, senderIsAllowed } from "./deliverability";
import { meaningfulCampaignOpenPredicate,nonOpenerCampaignTargetPredicate } from "./campaign-targeting";
import type { TestEmailResult } from "./test-email";

type CampaignRow = {
  id: string;
  status: string;
  subject: string;
  preview_text: string;
  from_name: string;
  from_email: string;
  reply_to: string;
  target_type: "all" | "list" | "tag" | "segment" | "non_openers";
  target_id: string | null;
  list_id: string | null;
  template_id: string | null;
  template_version_id: string | null;
  html_content: string;
  text_content: string;
  exclusion_segment_ids: string[];
  track_opens: boolean | null;
  track_clicks: boolean | null;
  version: number;
  approval_required: boolean;
  approved_at: Date | null;
  approved_version: number | null;
};

export type CampaignActor = { id: string; kind: "session" | "api_key" | "system" };

async function recordCampaignTransition(campaignId:string,fromStatus:string|null,toStatus:string,action:string,actor:CampaignActor={id:"worker",kind:"system"},detail:Record<string,unknown>={}){
  await sql`INSERT INTO campaign_transitions(campaign_id,from_status,to_status,action,user_id,api_key_id,detail)
    VALUES(${campaignId},${fromStatus},${toStatus},${action},${actor.kind==="session"?actor.id:null},${actor.kind==="api_key"?actor.id:null},${sql.json(JSON.parse(JSON.stringify(detail)) as never)})`;
}

type TargetContact = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  custom_fields: Record<string, string>;
  subscription_id: string;
  subscription_values: Record<string, string>;
};

async function targetContacts(campaign: CampaignRow) {
  if (!campaign.list_id) throw new Error("La campaña necesita una lista principal");
  let extra = "TRUE";
  let values: SegmentParameter[] = [];

  if (campaign.target_type === "tag" && campaign.target_id) {
    extra = "EXISTS (SELECT 1 FROM contact_tags ct WHERE ct.contact_id = c.id AND ct.tag_id::text = $2)";
    values = [campaign.target_id];
  } else if (campaign.target_type === "non_openers" && campaign.target_id) {
    extra = nonOpenerCampaignTargetPredicate("$2");
    values = [campaign.target_id];
  } else if (campaign.target_type === "segment" && campaign.target_id) {
    const [segment] = await sql<{ rules: SegmentRule[]; definition:SegmentGroup;list_id:string|null;match_type: "all" | "any" }[]>`
      SELECT rules,definition,list_id,match_type FROM segments WHERE id = ${campaign.target_id} AND status='active'
    `;
    if (!segment) throw new Error("El segmento seleccionado ya no existe");
    if(segment.list_id&&segment.list_id!==campaign.list_id)throw new Error("El segmento pertenece a otra lista");
    const built = buildSegmentFilter(segment.definition?.children?.length?segment.definition:segment.rules, segment.match_type, 2);
    extra = built.where;
    values = built.values;
  }

  for (const exclusionId of campaign.exclusion_segment_ids ?? []) {
    const [segment] = await sql<{ rules: SegmentRule[];definition:SegmentGroup;list_id:string|null;match_type: "all" | "any" }[]>`
      SELECT rules,definition,list_id,match_type FROM segments WHERE id=${exclusionId} AND status='active'
    `;
    if (!segment) continue;
    if(segment.list_id&&segment.list_id!==campaign.list_id)continue;
    const built = buildSegmentFilter(segment.definition?.children?.length?segment.definition:segment.rules, segment.match_type, 2 + values.length);
    extra = `(${extra}) AND NOT (${built.where})`;
    values.push(...built.values);
  }

  return sql.unsafe<TargetContact[]>(`
    SELECT c.id, c.email, c.first_name, c.last_name, c.custom_fields,
      sub.id AS subscription_id, sub.custom_values AS subscription_values
    FROM contacts c
    JOIN subscriptions sub ON sub.contact_id=c.id AND sub.list_id::text=$1 AND sub.status='active'
    WHERE c.status = 'active'
      AND NOT EXISTS (SELECT 1 FROM suppressions s WHERE lower(s.email) = lower(c.email) AND s.scope IN ('marketing','all') AND s.status='active')
      AND ${extra}
    ORDER BY c.created_at ASC
  `, [campaign.list_id, ...values]);
}

export async function startCampaign(campaignId: string,options:{action?:string;actor?:CampaignActor}={}) {
  const [preflight]=await sql<{from_email:string}[]>`SELECT from_email FROM campaigns WHERE id=${campaignId}`;
  if(!preflight)throw new Error("La campaña no existe");
  await assertSendingAvailable(preflight.from_email);
  const [campaign] = await sql<(CampaignRow&{previous_status:string})[]>`
    WITH previous AS (
      SELECT id,status FROM campaigns WHERE id=${campaignId} AND status IN ('draft','scheduled','paused')
        AND (approval_required=false OR (approved_at IS NOT NULL AND approved_version=version)) FOR UPDATE
    )
    UPDATE campaigns c
    SET status='sending',started_at=COALESCE(c.started_at,now()),paused_at=NULL,updated_at=now()
    FROM previous p WHERE c.id=p.id
    RETURNING c.*,p.status AS previous_status
  `;
  if (!campaign) throw new Error("La campaña no puede iniciarse en su estado actual");
  if (!campaign.html_content && !campaign.template_id) throw new Error("La campaña no tiene contenido");
  await recordCampaignTransition(campaignId,campaign.previous_status,"sending",options.action??(campaign.previous_status==="paused"?"resume":"launch"),options.actor);

  const [existingSnapshot]=await sql<{total:number;queued:number}[]>`
    SELECT count(*)::int AS total,count(*) FILTER(WHERE status='queued')::int AS queued
    FROM campaign_recipients WHERE campaign_id=${campaignId}
  `;
  if(existingSnapshot.total>0){
    const queuedRecipients=await sql<{id:string}[]>`SELECT id FROM campaign_recipients WHERE campaign_id=${campaignId} AND status='queued' ORDER BY created_at`;
    const runId=randomUUID();
    await getEmailQueue().addBulk(queuedRecipients.map(({id})=>({name:"send",data:{recipientId:id},opts:{jobId:`email-${id}-run-${runId}`}})));
    await sql`INSERT INTO audit_log(action,entity_type,entity_id,user_id,api_key_id,detail)VALUES('resume','campaign',${campaignId},${options.actor?.kind==="session"?options.actor.id:null},${options.actor?.kind==="api_key"?options.actor.id:null},${sql.json({snapshot_reused:true,total:existingSnapshot.total,queued:queuedRecipients.length})})`;
    return{recipients:existingSnapshot.total,queued:queuedRecipients.length,snapshotReused:true};
  }

  const contacts = await targetContacts(campaign);
  const experiment=await getCampaignExperimentSetup(campaignId);const experimentPlan=experiment?buildExperimentAssignments(experiment,contacts.length):null;
  const recipientIds: string[] = [];
  const includedContactIds = contacts.map((contact) => contact.id);

  await sql.begin(async (tx) => {
    await tx`DELETE FROM campaign_exclusions WHERE campaign_id=${campaignId}`;
    await tx`
      INSERT INTO campaign_exclusions (campaign_id,contact_id,subscription_id,email,reason,detail)
      SELECT ${campaignId},c.id,s.id,c.email,
        CASE
          WHEN s.status='unsubscribed' THEN 'unsubscribed'
          WHEN s.status='pending' THEN 'pending'
          WHEN s.status='archived' THEN 'archived'
          WHEN c.status<>'active' THEN 'contact_blocked'
          WHEN EXISTS (SELECT 1 FROM suppressions x WHERE lower(x.email)=lower(c.email) AND x.scope IN ('marketing','all') AND x.status='active') THEN 'suppressed'
          ELSE 'segment'
        END,
        jsonb_build_object('subscription_status',s.status,'contact_status',c.status)
      FROM subscriptions s JOIN contacts c ON c.id=s.contact_id
      WHERE s.list_id=${campaign.list_id}
        AND NOT (c.id = ANY(${includedContactIds}::uuid[]))
      ON CONFLICT DO NOTHING
    `;
    for (const [contactIndex,contact] of contacts.entries()) {
      const personalization = {
        first_name: contact.first_name,
        last_name: contact.last_name,
        full_name: `${contact.first_name} ${contact.last_name}`.trim(),
        email: contact.email,
        ...(contact.custom_fields ?? {}),
        ...(contact.subscription_values ?? {}),
      };
      const assignment=experimentPlan?.assignments[contactIndex];const variant=assignment?.variant??null;const initialStatus=assignment?.phase==="remainder"?"held":"queued";
      const [recipient] = await tx<{ id: string; outbound_message_id: string | null }[]>`
        INSERT INTO campaign_recipients (campaign_id, contact_id, subscription_id, email, status, personalization, queued_at,variant_id,experiment_phase)
        VALUES (${campaignId}, ${contact.id}, ${contact.subscription_id}, ${contact.email}, ${initialStatus}, ${tx.json(personalization)}, ${initialStatus==="queued"?new Date():null},${variant?.id??null},${assignment?.phase??null})
        ON CONFLICT (campaign_id, contact_id) DO UPDATE SET
          status = CASE WHEN campaign_recipients.status IN ('failed', 'pending') THEN 'queued' ELSE campaign_recipients.status END,
          queued_at = CASE WHEN campaign_recipients.status IN ('failed', 'pending') THEN now() ELSE campaign_recipients.queued_at END
        RETURNING id, outbound_message_id
      `;
      if (initialStatus==="queued"&&!recipient.outbound_message_id) {
        const [message] = await tx<{ id: string }[]>`
          INSERT INTO outbound_messages (
            kind, campaign_id, campaign_recipient_id, contact_id, subscription_id, template_version_id,
            to_email, to_name, from_email, from_name, reply_to, subject, status, variables,metadata,
            track_opens, track_clicks, idempotency_scope, idempotency_key, queued_at
          ) VALUES (
            'campaign', ${campaignId}, ${recipient.id}, ${contact.id}, ${contact.subscription_id}, ${variant?.template_version_id??campaign.template_version_id},
            ${contact.email}, ${personalization.full_name}, ${variant?.from_email??campaign.from_email}, ${variant?.from_name??campaign.from_name}, ${variant?.reply_to??campaign.reply_to},
            ${personalize(variant?.subject??campaign.subject, personalization)}, 'queued', ${tx.json(personalization)},${tx.json(variant?{variant_id:variant.id,experiment_phase:"sample"}:{})},
            ${campaign.track_opens ?? true}, ${campaign.track_clicks ?? true}, ${`campaign:${campaignId}`}, ${contact.id}, now()
          )
          ON CONFLICT (idempotency_scope, idempotency_key) WHERE idempotency_key IS NOT NULL
          DO UPDATE SET updated_at=now() RETURNING id
        `;
        await tx`UPDATE campaign_recipients SET outbound_message_id=${message.id} WHERE id=${recipient.id}`;
      }
      if(initialStatus==="queued")recipientIds.push(recipient.id);
    }
    await tx`
      UPDATE campaigns
      SET total_recipients = ${contacts.length}, updated_at = now(),
          status = CASE WHEN status IN ('paused','cancelled') THEN status WHEN ${contacts.length} = 0 THEN 'completed' ELSE 'sending' END,
          completed_at = CASE WHEN status NOT IN ('paused','cancelled') AND ${contacts.length} = 0 THEN now() ELSE completed_at END
      WHERE id = ${campaignId}
    `;
  });

  if(experiment&&experimentPlan)await markExperimentSampling(campaignId,experimentPlan.sampleSize,experimentPlan.remainderSize,options.actor??{id:"worker",kind:"system"});

  const[state]=await sql<{status:string}[]>`SELECT status FROM campaigns WHERE id=${campaignId}`;
  if(state?.status==="sending"){
    const runId=randomUUID();
    await getEmailQueue().addBulk(recipientIds.map((recipientId) => ({name:"send",data:{recipientId},opts:{jobId:`email-${recipientId}-run-${runId}`}})));
  }

  if(contacts.length===0&&state?.status==="completed")await recordCampaignTransition(campaignId,"sending","completed","empty_audience",options.actor);
  await sql`INSERT INTO audit_log (action, entity_type, entity_id,user_id,api_key_id, detail) VALUES ('send', 'campaign', ${campaignId},${options.actor?.kind==="session"?options.actor.id:null},${options.actor?.kind==="api_key"?options.actor.id:null}, ${sql.json({ recipients: contacts.length })})`;
  return { recipients: contacts.length };
}

export async function scheduleCampaign(campaignId:string,scheduledAt:Date,actor:CampaignActor){
  if(scheduledAt.getTime()<=Date.now()+30_000)throw new Error("La programación debe estar al menos 30 segundos en el futuro");
  const[row]=await sql<{previous_status:string;id:string}[]>`WITH previous AS(SELECT id,status FROM campaigns WHERE id=${campaignId} AND status IN('draft','scheduled') AND launch_idempotency_key IS NULL
      AND (approval_required=false OR (approved_at IS NOT NULL AND approved_version=version)) FOR UPDATE)
    UPDATE campaigns c SET status='scheduled',scheduled_at=${scheduledAt},approved_version=CASE WHEN c.approved_version=c.version THEN c.version+1 ELSE c.approved_version END,version=c.version+1,updated_at=now() FROM previous p WHERE c.id=p.id RETURNING c.id,p.status AS previous_status`;
  if(!row)throw new Error("La campaña no se puede programar: revisa su estado y aprobación vigente");
  await recordCampaignTransition(campaignId,row.previous_status,"scheduled","schedule",actor,{scheduled_at:scheduledAt.toISOString()});
  await sql`INSERT INTO audit_log(action,entity_type,entity_id,user_id,api_key_id,detail)VALUES('schedule','campaign',${campaignId},${actor.kind==="session"?actor.id:null},${actor.kind==="api_key"?actor.id:null},${sql.json({scheduled_at:scheduledAt.toISOString()})})`;
  return{id:campaignId,status:"scheduled",scheduled_at:scheduledAt};
}

export async function unscheduleCampaign(campaignId:string,actor:CampaignActor){
  const[row]=await sql<{previous_status:string}[]>`WITH previous AS(SELECT id,status FROM campaigns WHERE id=${campaignId} AND status='scheduled' AND launch_idempotency_key IS NULL FOR UPDATE)
    UPDATE campaigns c SET status='draft',scheduled_at=NULL,approved_version=CASE WHEN c.approved_version=c.version THEN c.version+1 ELSE c.approved_version END,version=c.version+1,updated_at=now() FROM previous p WHERE c.id=p.id RETURNING p.status AS previous_status`;
  if(!row)throw new Error("Solo se puede retirar una campaña que todavía está programada");
  await recordCampaignTransition(campaignId,row.previous_status,"draft","unschedule",actor);
  await sql`INSERT INTO audit_log(action,entity_type,entity_id,user_id,api_key_id,detail)VALUES('unschedule','campaign',${campaignId},${actor.kind==="session"?actor.id:null},${actor.kind==="api_key"?actor.id:null},'{}')`;
  return{id:campaignId,status:"draft"};
}

export async function pauseCampaign(campaignId:string,actor:CampaignActor){
  const[row]=await sql<{previous_status:string}[]>`WITH previous AS(SELECT id,status FROM campaigns WHERE id=${campaignId} AND status='sending' FOR UPDATE)
    UPDATE campaigns c SET status='paused',paused_at=now(),updated_at=now() FROM previous p WHERE c.id=p.id RETURNING p.status AS previous_status`;
  if(!row)throw new Error("Solo se puede pausar una campaña en envío");
  await recordCampaignTransition(campaignId,row.previous_status,"paused","pause",actor);
  await sql`INSERT INTO audit_log(action,entity_type,entity_id,user_id,api_key_id,detail)VALUES('pause','campaign',${campaignId},${actor.kind==="session"?actor.id:null},${actor.kind==="api_key"?actor.id:null},'{}')`;
  return{id:campaignId,status:"paused"};
}

export async function cancelCampaign(campaignId:string,actor:CampaignActor){
  const[row]=await sql<{previous_status:string}[]>`WITH previous AS(SELECT id,status FROM campaigns WHERE id=${campaignId} AND status IN('draft','pending_approval','scheduled','sending','paused') FOR UPDATE)
    UPDATE campaigns c SET status='cancelled',cancelled_at=now(),scheduled_at=NULL,updated_at=now() FROM previous p WHERE c.id=p.id RETURNING p.status AS previous_status`;
  if(!row)throw new Error("La campaña no se puede cancelar en su estado actual");
  await sql.begin(async tx=>{await tx`UPDATE campaign_recipients SET status='failed',failure_reason='Campaña cancelada antes del envío',processing_at=NULL,updated_at=now() WHERE campaign_id=${campaignId} AND status IN('held','queued')`;await tx`UPDATE outbound_messages SET status='cancelled',failure_code='campaign_cancelled',failure_reason='Campaña cancelada antes del envío',updated_at=now() WHERE campaign_id=${campaignId} AND status IN('accepted','queued')`;await tx`UPDATE campaign_experiments SET status='cancelled',updated_at=now() WHERE campaign_id=${campaignId} AND status NOT IN('completed','cancelled')`;});
  await recordCampaignTransition(campaignId,row.previous_status,"cancelled","cancel",actor);
  await sql`INSERT INTO audit_log(action,entity_type,entity_id,user_id,api_key_id,detail)VALUES('cancel','campaign',${campaignId},${actor.kind==="session"?actor.id:null},${actor.kind==="api_key"?actor.id:null},'{}')`;
  return{id:campaignId,status:"cancelled"};
}

async function recordApprovalComment(campaignId:string,action:"request"|"approve"|"reject"|"comment",comment:string,version:number,actor:CampaignActor){
  await sql`INSERT INTO campaign_approval_comments(campaign_id,action,comment,campaign_version,user_id,api_key_id)
    VALUES(${campaignId},${action},${comment},${version},${actor.kind==="session"?actor.id:null},${actor.kind==="api_key"?actor.id:null})`;
}

export async function requestCampaignApproval(campaignId:string,comment:string,actor:CampaignActor){
  const[row]=await sql<{version:number;previous_status:string}[]>`WITH previous AS(
      SELECT id,status FROM campaigns WHERE id=${campaignId} AND status='draft' AND launch_idempotency_key IS NULL FOR UPDATE
    ) UPDATE campaigns c SET status='pending_approval',approval_required=true,approved_by=NULL,approved_api_key_id=NULL,approved_at=NULL,approved_version=NULL,updated_at=now()
      FROM previous p WHERE c.id=p.id RETURNING c.version,p.status AS previous_status`;
  if(!row)throw new Error("Solo se puede solicitar aprobación para un borrador no iniciado");
  await recordApprovalComment(campaignId,"request",comment,row.version,actor);
  await recordCampaignTransition(campaignId,row.previous_status,"pending_approval","request_approval",actor,{campaign_version:row.version});
  await sql`INSERT INTO audit_log(action,entity_type,entity_id,user_id,api_key_id,detail)VALUES('request_approval','campaign',${campaignId},${actor.kind==="session"?actor.id:null},${actor.kind==="api_key"?actor.id:null},${sql.json({version:row.version,comment})})`;
  return{id:campaignId,status:"pending_approval",approval_required:true,version:row.version};
}

export async function approveCampaign(campaignId:string,comment:string,actor:CampaignActor){
  const[row]=await sql<{version:number;previous_status:string;approved_at:Date}[]>`WITH previous AS(
      SELECT id,status FROM campaigns WHERE id=${campaignId} AND status='pending_approval' FOR UPDATE
    ) UPDATE campaigns c SET status='draft',approval_required=true,approved_by=${actor.kind==="session"?actor.id:null},approved_api_key_id=${actor.kind==="api_key"?actor.id:null},approved_at=now(),approved_version=c.version,updated_at=now()
      FROM previous p WHERE c.id=p.id RETURNING c.version,c.approved_at,p.status AS previous_status`;
  if(!row)throw new Error("La campaña no está pendiente de aprobación");
  await recordApprovalComment(campaignId,"approve",comment,row.version,actor);
  await recordCampaignTransition(campaignId,row.previous_status,"draft","approve",actor,{campaign_version:row.version});
  await sql`INSERT INTO audit_log(action,entity_type,entity_id,user_id,api_key_id,detail)VALUES('approve','campaign',${campaignId},${actor.kind==="session"?actor.id:null},${actor.kind==="api_key"?actor.id:null},${sql.json({version:row.version,comment})})`;
  return{id:campaignId,status:"draft",approval_required:true,approved_version:row.version,approved_at:row.approved_at};
}

export async function rejectCampaign(campaignId:string,comment:string,actor:CampaignActor){
  const[row]=await sql<{version:number;previous_status:string}[]>`WITH previous AS(
      SELECT id,status FROM campaigns WHERE id=${campaignId} AND status='pending_approval' FOR UPDATE
    ) UPDATE campaigns c SET status='draft',approval_required=true,approved_by=NULL,approved_api_key_id=NULL,approved_at=NULL,approved_version=NULL,updated_at=now()
      FROM previous p WHERE c.id=p.id RETURNING c.version,p.status AS previous_status`;
  if(!row)throw new Error("La campaña no está pendiente de aprobación");
  await recordApprovalComment(campaignId,"reject",comment,row.version,actor);
  await recordCampaignTransition(campaignId,row.previous_status,"draft","reject",actor,{campaign_version:row.version});
  await sql`INSERT INTO audit_log(action,entity_type,entity_id,user_id,api_key_id,detail)VALUES('reject','campaign',${campaignId},${actor.kind==="session"?actor.id:null},${actor.kind==="api_key"?actor.id:null},${sql.json({version:row.version,comment})})`;
  return{id:campaignId,status:"draft",approval_required:true,approved_version:null,approved_at:null};
}

export async function commentOnCampaignApproval(campaignId:string,comment:string,actor:CampaignActor){
  const[row]=await sql<{version:number;status:string}[]>`SELECT version,status FROM campaigns WHERE id=${campaignId} AND archived_at IS NULL`;
  if(!row)throw new Error("Campaña no encontrada");
  await recordApprovalComment(campaignId,"comment",comment,row.version,actor);
  await sql`INSERT INTO audit_log(action,entity_type,entity_id,user_id,api_key_id,detail)VALUES('comment','campaign',${campaignId},${actor.kind==="session"?actor.id:null},${actor.kind==="api_key"?actor.id:null},${sql.json({version:row.version,comment})})`;
  return{id:campaignId,status:row.status,version:row.version};
}

let smtpTransport: nodemailer.Transporter | undefined;
const sesClients = new Map<string,SESv2Client>();

function smtp() {
  smtpTransport ??= nodemailer.createTransport({ host: env.smtpHost, port: env.smtpPort, secure: false });
  return smtpTransport;
}

function ses(region:string) {
  let client=sesClients.get(region);if(!client){client=new SESv2Client({region,credentials:env.awsCredentials});sesClients.set(region,client);}return client;
}

export async function sendRecipient(recipientId: string) {
  const [row] = await sql<{
    recipient_id: string;
    outbound_message_id: string | null;
    campaign_id: string;
    contact_id: string | null;
    subscription_id: string | null;
    list_id: string | null;
    email: string;
    recipient_status: string;
    personalization: Record<string, string>;
    campaign_status: string;
    subject: string;
    from_name: string;
    from_email: string;
    reply_to: string;
    html_content: string;
    text_content: string;
    configuration_set: string;
    physical_address: string;
    track_opens: boolean;
    track_clicks: boolean;
    configured_transport: "smtp" | "ses";
    aws_region:string;
    global_sending_paused:boolean;
    ses_tracking_source:"local"|"ses";
    allowed_sender_domains:string[];
    default_from_email:string;
    template_version_id:string|null;
  }[]>`
    SELECT cr.id AS recipient_id, cr.outbound_message_id, cr.campaign_id, cr.contact_id, cr.subscription_id, c.list_id, cr.email,
      cr.status AS recipient_status, cr.personalization,
      c.status AS campaign_status, COALESCE(cv.subject,c.subject) AS subject,COALESCE(cv.from_name,c.from_name) AS from_name,COALESCE(cv.from_email,c.from_email) AS from_email,COALESCE(cv.reply_to,c.reply_to) AS reply_to,
      COALESCE(NULLIF(cv.html_content,''),NULLIF(c.html_content,''), tv.html_content, t.html_content, '') AS html_content,
      COALESCE(NULLIF(cv.text_content,''),NULLIF(c.text_content,''), tv.text_content, t.text_content, '') AS text_content,
      COALESCE(NULLIF(s.ses_marketing_configuration_set,''), s.ses_configuration_set) AS configuration_set,
      s.physical_address,
      COALESCE(c.track_opens, s.track_opens) AS track_opens,
      COALESCE(c.track_clicks, s.track_clicks) AS track_clicks,
      s.mail_transport AS configured_transport,s.aws_region,s.global_sending_paused,s.ses_tracking_source,s.allowed_sender_domains,s.default_from_email,
      COALESCE(cv.template_version_id,c.template_version_id) AS template_version_id
    FROM campaign_recipients cr
    JOIN campaigns c ON c.id = cr.campaign_id
    LEFT JOIN campaign_variants cv ON cv.id=cr.variant_id
    LEFT JOIN template_versions tv ON tv.id = c.template_version_id
    LEFT JOIN templates t ON t.id = c.template_id
    CROSS JOIN settings s
    WHERE cr.id = ${recipientId}
  `;

  if (!row || row.recipient_status !== "queued") return { skipped: true };
  if (row.campaign_status !== "sending") return { skipped: true };
  if(row.global_sending_paused)return{skipped:true,paused:true};
  if(!senderIsAllowed(row.from_email,row))throw new Error("El remitente ya no está permitido");

  const[claimed]=await sql<{id:string}[]>`
    UPDATE campaign_recipients cr SET status='processing',processing_at=now(),attempt_count=attempt_count+1,updated_at=now()
    WHERE cr.id=${recipientId} AND cr.status='queued'
      AND EXISTS(SELECT 1 FROM campaigns c WHERE c.id=cr.campaign_id AND c.status='sending')
    RETURNING cr.id
  `;
  if(!claimed)return{skipped:true};

  if (row.outbound_message_id) await sql`
    UPDATE outbound_messages SET status='processing', attempt_count=attempt_count+1, updated_at=now()
    WHERE id=${row.outbound_message_id} AND status IN ('accepted','queued','failed')
  `;

  const subject = personalize(row.subject, row.personalization);
  const selectedTransport = env.mailTransport || row.configured_transport;
  const [unsubscribeAccess,preferenceAccess]=row.contact_id&&row.subscription_id?await Promise.all([
    issuePublicToken({purpose:"unsubscribe",contactId:row.contact_id,subscriptionId:row.subscription_id,listId:row.list_id,expiresInDays:365,detail:{campaign_id:row.campaign_id,recipient_id:row.recipient_id}}),
    issuePublicToken({purpose:"preferences",contactId:row.contact_id,subscriptionId:row.subscription_id,listId:row.list_id,expiresInDays:365}),
  ]):[null,null];
  const unsubscribeUrl=unsubscribeAccess?`${env.appUrl}/unsubscribe/${encodeURIComponent(unsubscribeAccess.token)}`:undefined;
  const preferencesUrl=preferenceAccess?`${env.appUrl}/preferences/${encodeURIComponent(preferenceAccess.token)}`:undefined;
  const templateVariables = withCampaignTemplateVariables(row.personalization, {
    unsubscribeUrl, preferencesUrl, physicalAddress: row.physical_address,
  });
  const rawHtml = personalize(row.html_content, templateVariables);
  const text = personalize(row.text_content, templateVariables);
  const html = buildTrackedHtml({
    html: rawHtml,
    recipientId,
    trackOpens: row.track_opens&&(selectedTransport!=="ses"||row.ses_tracking_source==="local"),
    trackClicks: row.track_clicks&&(selectedTransport!=="ses"||row.ses_tracking_source==="local"),
    unsubscribeUrl,
    preferencesUrl,
  });
  const [htmlBlob, textBlob] = await Promise.all([
    storeContent(html, "text/html; charset=utf-8"),
    storeContent(text || subject, "text/plain; charset=utf-8"),
  ]);
  if (row.outbound_message_id) await sql.begin(async (tx) => {
    await tx`
      UPDATE outbound_messages SET html_blob_id=${htmlBlob.id},text_blob_id=${textBlob.id},processed_at=COALESCE(processed_at,now()),updated_at=now()
      WHERE id=${row.outbound_message_id}
    `;
    await tx`
      INSERT INTO email_events(event_key,message_id,recipient_id,campaign_id,contact_id,type,source,payload)
      VALUES(${eventKey({ messageId: row.outbound_message_id, type: "processed" })},${row.outbound_message_id},${recipientId},${row.campaign_id},${row.contact_id},'processed','worker','{}')
      ON CONFLICT(event_key) DO NOTHING
    `;
  });
  const legacyUnsubscribeToken = unsubscribeUrl?null:(await import("./auth")).createUnsubscribeToken(row.email, row.campaign_id);
  const headerUnsubscribeUrl = unsubscribeUrl??`${env.appUrl}/api/unsubscribe?token=${encodeURIComponent(legacyUnsubscribeToken!)}`;
  let messageId = "";

  if (selectedTransport === "ses") {
    const response = await ses(env.awsRegion??row.aws_region).send(new SendEmailCommand({
      FromEmailAddress: `${row.from_name} <${row.from_email}>`,
      Destination: { ToAddresses: [row.email] },
      ReplyToAddresses: row.reply_to ? [row.reply_to] : undefined,
      ConfigurationSetName: row.configuration_set || undefined,
      EmailTags: [
        ...(row.outbound_message_id ? [{ Name: "message_id", Value: row.outbound_message_id }] : []),
        { Name: "channel", Value: "marketing" },
        { Name: "campaign_id", Value: row.campaign_id },
        { Name: "recipient_id", Value: row.recipient_id },
        ...(row.template_version_id?[{Name:"template_version_id",Value:row.template_version_id}]:[]),
      ],
      Content: {
        Simple: {
          Subject: { Data: subject, Charset: "UTF-8" },
          Body: {
            Html: { Data: html, Charset: "UTF-8" },
            Text: { Data: text || subject, Charset: "UTF-8" },
          },
          Headers: [
            { Name: "List-Unsubscribe", Value: `<${headerUnsubscribeUrl}>` },
            { Name: "List-Unsubscribe-Post", Value: "List-Unsubscribe=One-Click" },
          ],
        },
      },
    }));
    messageId = response.MessageId ?? "";
  } else {
    const response = await smtp().sendMail({
      from: `${row.from_name} <${row.from_email}>`,
      to: row.email,
      replyTo: row.reply_to || undefined,
      subject,
      html,
      text: text || subject,
      headers: {
        "List-Unsubscribe": `<${headerUnsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        "X-KiroMail-Campaign": row.campaign_id,
      },
    });
    messageId = response.messageId;
  }

  const localDelivery = selectedTransport === "smtp";
  await sql.begin(async (tx) => {
    await tx`
      UPDATE campaign_recipients SET
        status = ${localDelivery ? "delivered" : "sent"}, ses_message_id = ${messageId}, sent_at = now(),
        delivered_at = ${localDelivery ? new Date() : null}, failure_reason = NULL,processing_at=NULL,updated_at=now()
      WHERE id = ${recipientId}
    `;
    if (row.outbound_message_id) await tx`
      UPDATE outbound_messages SET
        status=${localDelivery ? "delivered" : "sent"}, ses_message_id=${messageId}, processed_at=COALESCE(processed_at,now()),
        sent_at=now(), delivered_at=${localDelivery ? new Date() : null}, failure_code=NULL, failure_reason=NULL, updated_at=now()
      WHERE id=${row.outbound_message_id}
    `;
    await tx`
      INSERT INTO email_events (event_key, message_id, recipient_id, campaign_id, contact_id, type, ses_message_id, source, payload)
      VALUES (${eventKey({ type: "send", messageId, recipientId })}, ${row.outbound_message_id}, ${recipientId}, ${row.campaign_id}, ${row.contact_id}, 'send', ${messageId}, 'local', ${tx.json({ transport: selectedTransport })})
      ON CONFLICT (event_key) DO NOTHING
    `;
    if (localDelivery) {
      await tx`
        INSERT INTO email_events (event_key, message_id, recipient_id, campaign_id, contact_id, type, ses_message_id, source, payload)
        VALUES (${eventKey({ type: "delivery", messageId, recipientId })}, ${row.outbound_message_id}, ${recipientId}, ${row.campaign_id}, ${row.contact_id}, 'delivery', ${messageId}, 'local', ${tx.json({ transport: "smtp" })})
        ON CONFLICT (event_key) DO NOTHING
      `;
    }
  });
  await recomputeCampaignStats(row.campaign_id);
  return { messageId };
}

type TestEmailSource = { templateId: string; campaignId?: never } | { campaignId: string; templateId?: never };
type TestEmailContent = {
  html_content: string;
  text_content: string;
  channel: "marketing" | "transactional";
  physical_address: string;
  ses_configuration_set: string;
  mail_transport: "smtp" | "ses";
  aws_region: string;
  template_id: string | null;
  template_version_id: string | null;
  campaign_id: string | null;
};

export async function sendTestEmail(input: TestEmailSource & { email: string; subject: string; fromName?: string; fromEmail?: string; replyTo?: string }) {
  const settings = await assertSendingAvailable(input.fromEmail);
  const fromName = input.fromName?.trim() || settings.default_from_name;
  const fromEmail = input.fromEmail?.trim() || settings.default_from_email;
  const replyTo = input.replyTo === undefined ? settings.default_reply_to : input.replyTo;
  const campaignId = input.campaignId;
  const templateId = input.templateId;
  let rows: TestEmailContent[];
  if (campaignId) {
    rows = await sql<TestEmailContent[]>`
      SELECT c.html_content,c.text_content,'marketing' AS channel,s.physical_address,
        COALESCE(NULLIF(s.ses_marketing_configuration_set,''),s.ses_configuration_set) AS ses_configuration_set,
        s.mail_transport,s.aws_region,c.template_id,c.template_version_id,c.id AS campaign_id
      FROM campaigns c CROSS JOIN settings s
      WHERE c.id=${campaignId} AND c.archived_at IS NULL
    `;
  } else if (templateId) {
    rows = await sql<TestEmailContent[]>`
      SELECT COALESCE(v.html_content,t.html_content) AS html_content,
        COALESCE(v.text_content,t.text_content) AS text_content,
        t.channel,s.physical_address,
        CASE WHEN t.channel='transactional'
          THEN COALESCE(NULLIF(s.ses_transactional_configuration_set,''),s.ses_configuration_set)
          ELSE COALESCE(NULLIF(s.ses_marketing_configuration_set,''),s.ses_configuration_set)
        END AS ses_configuration_set,
        s.mail_transport,s.aws_region,t.id AS template_id,v.id AS template_version_id,NULL::uuid AS campaign_id
      FROM templates t LEFT JOIN template_versions v ON v.id=t.published_version_id CROSS JOIN settings s
      WHERE t.id=${templateId}
    `;
  } else {
    throw new Error("Falta el origen del correo de prueba");
  }
  const [row] = rows;
  if (!row) throw new Error(campaignId ? "La campaña ya no existe" : "La plantilla ya no existe");
  const sample = withCampaignTemplateVariables(
    { first_name: "Prueba", last_name: "KiroMail", full_name: "Prueba KiroMail", email: input.email, city: "Madrid", country: "España" },
    {
      unsubscribeUrl: row.channel === "marketing" ? `${env.appUrl}/unsubscribe/test-preview` : undefined,
      preferencesUrl: row.channel === "marketing" ? `${env.appUrl}/preferences/test-preview` : undefined,
      physicalAddress: row.physical_address,
    },
  );
  const subject = personalize(input.subject, sample);
  const html = personalize(row.html_content, sample);
  const text = personalize(row.text_content, sample) || subject;
  const selectedTransport: "smtp" | "ses" =
    env.mailTransport === "smtp" || env.mailTransport === "ses"
      ? env.mailTransport
      : row.mail_transport;
  const region = env.awsRegion ?? row.aws_region;
  let providerMessageId = "";
  if (selectedTransport === "ses") {
    const response = await ses(region).send(new SendEmailCommand({
      FromEmailAddress: `${fromName} <${fromEmail}>`,
      Destination: { ToAddresses: [input.email] },
      ReplyToAddresses: replyTo ? [replyTo] : undefined,
      ConfigurationSetName: row.ses_configuration_set || undefined,
      EmailTags: [
        { Name: "channel", Value: row.channel },
        { Name: "message_type", Value: row.campaign_id ? "campaign_test" : "template_test" },
        ...(row.campaign_id ? [{ Name: "campaign_id", Value: row.campaign_id }] : []),
        ...(row.template_id ? [{ Name: "template_id", Value: row.template_id }] : []),
        ...(row.template_version_id ? [{ Name: "template_version_id", Value: row.template_version_id }] : []),
      ],
      Content: { Simple: { Subject: { Data: `[PRUEBA] ${subject}`, Charset: "UTF-8" }, Body: { Html: { Data: html, Charset: "UTF-8" }, Text: { Data: text, Charset: "UTF-8" } } } },
    }));
    providerMessageId = response.MessageId ?? "";
  } else {
    const response = await smtp().sendMail({ from: `${fromName} <${fromEmail}>`, to: input.email, replyTo: replyTo || undefined, subject: `[PRUEBA] ${subject}`, html, text, headers: { "X-KiroMail-Test": "true" } });
    providerMessageId = response.messageId;
  }
  const result = {
    sent: true,
    transport: selectedTransport,
    region,
    provider_message_id: providerMessageId,
    status: selectedTransport === "ses" ? "provider_accepted" as const : "delivered" as const,
  } satisfies TestEmailResult;
  const entityType = row.campaign_id ? "campaign" : "template";
  const entityId = row.campaign_id ?? row.template_id!;
  await sql`INSERT INTO audit_log (action, entity_type, entity_id, detail) VALUES ('test_send', ${entityType}, ${entityId}, ${sql.json({ email: input.email, template_version_id: row.template_version_id, ...result })})`;
  return result;
}

export async function markRecipientFailed(recipientId: string, error: Error) {
  const [recipient] = await sql<{ campaign_id: string; outbound_message_id: string | null }[]>`
    UPDATE campaign_recipients SET status = 'failed', failure_reason = ${error.message.slice(0, 500)},updated_at=now()
    WHERE id = ${recipientId} RETURNING campaign_id, outbound_message_id
  `;
  if (recipient?.outbound_message_id) await sql`
    UPDATE outbound_messages SET status='failed', failure_reason=${error.message.slice(0, 500)}, updated_at=now()
    WHERE id=${recipient.outbound_message_id}
  `;
  if (recipient) await recomputeCampaignStats(recipient.campaign_id);
}

export async function releaseRecipientForRetry(recipientId:string,error:Error){
  const[row]=await sql<{outbound_message_id:string|null}[]>`UPDATE campaign_recipients SET status='queued',processing_at=NULL,failure_reason=${error.message.slice(0,500)},updated_at=now() WHERE id=${recipientId} AND status='processing' RETURNING outbound_message_id`;
  if(row?.outbound_message_id)await sql`UPDATE outbound_messages SET status='queued',failure_reason=${error.message.slice(0,500)},updated_at=now() WHERE id=${row.outbound_message_id} AND ses_message_id IS NULL`;
}

export async function recomputeCampaignStats(campaignId: string) {
  await sql`
    UPDATE campaigns c SET
      sent_count = x.sent_count,
      delivered_count = x.delivered_count,
      open_count = x.open_count,
      click_count = x.click_count,
      bounce_count = x.bounce_count,
      complaint_count = x.complaint_count,
      unsubscribe_count = x.unsubscribe_count,
      status = CASE
        WHEN c.status = 'sending' AND x.finished_count >= c.total_recipients THEN 'completed'
        ELSE c.status
      END,
      completed_at = CASE
        WHEN c.status = 'sending' AND x.finished_count >= c.total_recipients THEN now()
        ELSE c.completed_at
      END,
      updated_at = now()
    FROM (
      SELECT campaign_id,
        count(*) FILTER (WHERE sent_at IS NOT NULL)::int AS sent_count,
        count(*) FILTER (WHERE delivered_at IS NOT NULL OR status = 'delivered')::int AS delivered_count,
        count(*) FILTER (WHERE open_count > 0)::int AS open_count,
        count(*) FILTER (WHERE click_count > 0)::int AS click_count,
        count(*) FILTER (WHERE status = 'bounced')::int AS bounce_count,
        count(*) FILTER (WHERE status = 'complained')::int AS complaint_count,
        count(*) FILTER (WHERE status = 'unsubscribed')::int AS unsubscribe_count,
        count(*) FILTER (WHERE status IN ('sent','delivered','bounced','complained','unsubscribed','failed'))::int AS finished_count
      FROM campaign_recipients WHERE campaign_id = ${campaignId} GROUP BY campaign_id
    ) x
    WHERE c.id = x.campaign_id
  `;
  await sql`INSERT INTO campaign_transitions(campaign_id,from_status,to_status,action,detail)
    SELECT id,'sending','completed','auto_complete',${sql.json({source:"recipient_stats"})} FROM campaigns
    WHERE id=${campaignId} AND status='completed' ON CONFLICT DO NOTHING`;
  await advanceCampaignExperiment(campaignId);
}

export async function scheduleDueCampaigns() {
  const due = await sql<{ id: string }[]>`
    SELECT id FROM campaigns WHERE status = 'scheduled' AND scheduled_at <= now() ORDER BY scheduled_at ASC LIMIT 20
  `;
  for (const campaign of due) {
    try { await startCampaign(campaign.id,{action:"scheduled_launch",actor:{id:"worker",kind:"system"}}); } catch (error) { console.error("Could not start campaign", campaign.id, error); }
  }
}

export async function recoverQueuedRecipients() {
  await sql`UPDATE campaign_recipients SET status='queued',processing_at=NULL,updated_at=now() WHERE status='processing' AND processing_at<now()-interval '5 minutes' AND ses_message_id IS NULL`;
  const recipients = await sql<{ id: string }[]>`
    SELECT cr.id FROM campaign_recipients cr JOIN campaigns c ON c.id = cr.campaign_id
    WHERE cr.status = 'queued' AND c.status = 'sending' LIMIT 10000
  `;
  const runId=randomUUID();
  await getEmailQueue().addBulk(recipients.map(({ id }) => ({ name: "send", data: { recipientId: id }, opts: { jobId: `email-${id}-recover-${runId}` } })));
}

export async function estimateCampaignAudience(campaignId: string) {
  const [campaign] = await sql<CampaignRow[]>`SELECT * FROM campaigns WHERE id=${campaignId}`;
  if (!campaign) throw new Error("La campaña no existe");
  const included = await targetContacts(campaign);
  const [totals] = await sql<{
    total: number; active: number; unsubscribed: number; pending: number; archived: number; blocked: number; suppressed: number;
  }[]>`
    SELECT count(*)::int AS total,
      count(*) FILTER (WHERE s.status='active' AND c.status='active')::int AS active,
      count(*) FILTER (WHERE s.status='unsubscribed')::int AS unsubscribed,
      count(*) FILTER (WHERE s.status='pending')::int AS pending,
      count(*) FILTER (WHERE s.status='archived')::int AS archived,
      count(*) FILTER (WHERE c.status<>'active')::int AS blocked,
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM suppressions x WHERE lower(x.email)=lower(c.email) AND x.scope IN ('marketing','all') AND x.status='active'))::int AS suppressed
    FROM subscriptions s JOIN contacts c ON c.id=s.contact_id WHERE s.list_id=${campaign.list_id}
  `;
  return { included: included.length, excluded: Math.max(0, totals.total - included.length), breakdown: totals, sample: included.slice(0,20).map(({ id,email,first_name,last_name }) => ({ id,email,first_name,last_name })) };
}

export async function getNonOpenerResendPreview(sourceCampaignId: string) {
  const [source] = await sql<(CampaignRow & { name:string;sent_count:number;open_count:number;archived_at:Date|null;tracking_enabled:boolean })[]>`
    SELECT c.*,
      EXISTS(SELECT 1 FROM outbound_messages m WHERE m.campaign_id=c.id AND m.track_opens) AS tracking_enabled
    FROM campaigns c WHERE c.id=${sourceCampaignId} AND c.archived_at IS NULL
  `;
  if (!source) return null;
  const meaningfulOpen = meaningfulCampaignOpenPredicate("source_recipient");
  const [stats] = await sql.unsafe<{ sent:number;opened:number }[]>(`
    SELECT
      count(*) FILTER(WHERE source_recipient.sent_at IS NOT NULL)::int AS sent,
      count(*) FILTER(WHERE source_recipient.sent_at IS NOT NULL AND ${meaningfulOpen})::int AS opened
    FROM campaign_recipients source_recipient
    WHERE source_recipient.campaign_id=$1::uuid
  `,[sourceCampaignId]);
  const eligible = source.list_id
    ? await targetContacts({ ...source,target_type:"non_openers",target_id:source.id })
    : [];
  const reason = source.status !== "completed"
    ? "Solo se puede preparar el reenvío de una campaña completada"
    : !source.tracking_enabled
      ? "La campaña original no tenía seguimiento de aperturas"
      : stats.sent === 0
        ? "La campaña original no tiene envíos completados"
        : eligible.length === 0
          ? "No quedan destinatarios enviables sin apertura"
          : null;
  return {
    available: reason === null,
    eligible: eligible.length,
    sent: stats.sent,
    opened: stats.opened,
    tracking_enabled: source.tracking_enabled,
    reason,
    source,
  };
}
