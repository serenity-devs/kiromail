import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import nodemailer from "nodemailer";
import { env } from "./config";
import { resolveStorageKey } from "./assets";
import { readContent, storeContent } from "./content-storage";
import { sql } from "./db";
import { buildTransactionalTrackedHtml, eventKey, personalize, type Personalization } from "./email";
import { getTransactionalQueue } from "./queue";
import { senderIsAllowed } from "./deliverability";
import { assertMimeWithinLimit, buildTransactionalMime, type TransactionalMimeAttachment } from "./transactional-mime";

export class TransactionalError extends Error {
  constructor(message: string, public status = 400, public code = "invalid_request") { super(message); }
}

export type TransactionalSendInput = {
  to: { email: string; name?: string };
  from?: { email: string; name?: string };
  reply_to?: string;
  template_key?: string;
  template_version_id?: string;
  subject?: string;
  html?: string;
  text?: string;
  variables?: Record<string, string | number | boolean | null>;
  metadata?: Record<string, unknown>;
  track_opens?: boolean;
  track_clicks?: boolean;
  attachments?: { asset_id: string; filename?: string; disposition?: "attachment"|"inline"; content_id?: string }[];
};

type Settings = {
  default_from_name: string;
  default_from_email: string;
  default_reply_to: string;
  mail_transport: "smtp" | "ses";
  ses_configuration_set: string;
  ses_transactional_configuration_set: string;
  transactional_track_opens: boolean;
  transactional_track_clicks: boolean;
  content_retention_days: number;
  aws_region:string;
  ses_tracking_source:"local"|"ses";
  allowed_sender_domains:string[];
  global_sending_paused:boolean;
};

type MessageRow = {
  id: string;
  status: string;
  request_hash: string | null;
  to_email: string;
  to_name: string;
  from_email: string;
  from_name: string;
  reply_to: string;
  subject: string;
  html_blob_id: string;
  text_blob_id: string | null;
  metadata: Record<string, unknown>;
  template_version_id: string | null;
  ses_message_id: string | null;
  accepted_at: Date;
  created_at: Date;
  retry_of_message_id: string|null;
  batch_id: string|null;
  batch_position: number|null;
  mime_blob_id: string|null;
  mime_byte_size: number|null;
};

type ResolvedAttachment={assetId:string;filename:string;contentType:string;disposition:"attachment"|"inline";contentId:string|null;storageKey:string;byteSize:number};
type TransactionalBatchResult = {
  index: number;
  id?: string;
  status?: string;
  duplicate?: boolean;
  error?: { code: string; message: string };
};

let smtpTransport: nodemailer.Transporter | undefined;
const sesClients=new Map<string,SESv2Client>();

function smtp() {
  smtpTransport ??= nodemailer.createTransport({ host: env.smtpHost, port: env.smtpPort, secure: false });
  return smtpTransport;
}

function ses(region:string) {
  let client=sesClients.get(region);if(!client){client=new SESv2Client({region,credentials:env.awsCredentials});sesClients.set(region,client);}return client;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function requestHash(input: TransactionalSendInput) {
  return createHash("sha256").update(canonical(input)).digest("hex");
}

function ensureSafeHeader(value: string, field: string) {
  if (/\r|\n/.test(value)) throw new TransactionalError(`${field} contiene caracteres no permitidos`);
}

function validateHtml(html: string) {
  if (Buffer.byteLength(html, "utf8") > 2_000_000) throw new TransactionalError("El HTML supera el límite de 2 MB", 413, "payload_too_large");
  if (/<\s*(script|iframe|object|embed|form)\b/i.test(html) || /\son[a-z]+\s*=/i.test(html) || /javascript\s*:/i.test(html)) {
    throw new TransactionalError("El HTML contiene elementos o atributos peligrosos", 422, "unsafe_html");
  }
}

function htmlToText(html: string) {
  return html
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p\s*>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function settings() {
  const [row] = await sql<Settings[]>`SELECT * FROM settings WHERE id=1`;
  if (!row) throw new TransactionalError("No existe configuración de envío", 503, "configuration_missing");
  return row;
}

function safeFilename(value:string){if(/[\r\n\\/\0]/.test(value)||value==="."||value==="..")throw new TransactionalError("El nombre de un adjunto no es válido",422,"attachment_invalid");return value;}
async function resolveAttachments(input:TransactionalSendInput):Promise<ResolvedAttachment[]>{const requested=input.attachments??[];if(!requested.length)return[];if(requested.length>10)throw new TransactionalError("Se admiten hasta diez adjuntos",422,"attachment_limit");const ids=[...new Set(requested.map(item=>item.asset_id))];const rows=await sql<{id:string;original_name:string;name:string;mime_type:string;byte_size:number;storage_key:string;archived_at:Date|null}[]>`SELECT id,original_name,name,mime_type,byte_size,storage_key,archived_at FROM assets WHERE id=ANY(${ids}::uuid[])`;const byId=new Map(rows.map(item=>[item.id,item]));let total=0;const result=requested.map(item=>{const asset=byId.get(item.asset_id);if(!asset||asset.archived_at)throw new TransactionalError(`El activo ${item.asset_id} no existe o está archivado`,422,"attachment_not_found");if(!["image/jpeg","image/png","image/gif","image/webp","application/pdf","text/plain","text/csv","text/calendar"].includes(asset.mime_type))throw new TransactionalError(`Tipo de adjunto no permitido: ${asset.mime_type}`,422,"attachment_type_not_allowed");total+=Number(asset.byte_size);const filename=safeFilename((item.filename||asset.original_name||asset.name).slice(0,240));const contentId=item.content_id?safeFilename(item.content_id):null;if(item.disposition==="inline"&&!asset.mime_type.startsWith("image/"))throw new TransactionalError("Solo las imágenes pueden enviarse inline",422,"attachment_invalid");return{assetId:asset.id,filename,contentType:asset.mime_type,disposition:item.disposition??"attachment",contentId,storageKey:asset.storage_key,byteSize:Number(asset.byte_size)};});if(total>env.transactionalAttachmentMaxBytes)throw new TransactionalError(`Los adjuntos superan el límite de ${env.transactionalAttachmentMaxBytes} bytes`,413,"attachments_too_large");return result;}

async function attachmentPayloads(messageId:string){const rows=await sql<{filename:string;content_type:string;disposition:"attachment"|"inline";content_id:string|null;storage_key:string}[]>`SELECT ma.filename,ma.content_type,ma.disposition,ma.content_id,a.storage_key FROM message_attachments ma JOIN assets a ON a.id=ma.asset_id WHERE ma.message_id=${messageId} ORDER BY ma.created_at,ma.id`;return Promise.all(rows.map(async item=>({...item,content:await readFile(resolveStorageKey(item.storage_key))})));}

async function resolvedAttachmentPayloads(attachments:ResolvedAttachment[]):Promise<TransactionalMimeAttachment[]> {
  return Promise.all(attachments.map(async item=>({
    filename:item.filename,
    content:await readFile(resolveStorageKey(item.storageKey)),
    contentType:item.contentType,
    disposition:item.disposition,
    contentId:item.contentId,
  })));
}

function validateMimeSize(mime:Buffer){
  try{return assertMimeWithinLimit(mime,env.transactionalMimeMaxBytes);}
  catch(error){
    const detail=error as Error&{code?:string;status?:number};
    if(detail.code==="message_too_large")throw new TransactionalError(detail.message,detail.status??413,detail.code);
    throw error;
  }
}

async function resolveContent(input: TransactionalSendInput) {
  const variables = (input.variables ?? {}) as Personalization;
  if (input.html) {
    if (input.template_key || input.template_version_id) throw new TransactionalError("Usa una plantilla o HTML directo, no ambos");
    if (!input.subject) throw new TransactionalError("subject es obligatorio con HTML directo");
    return { templateVersionId: null, subject: input.subject, html: input.html, text: input.text ?? "" };
  }
  if (!input.template_key && !input.template_version_id) throw new TransactionalError("Indica template_key, template_version_id o html");
  if (input.template_key && input.template_version_id) throw new TransactionalError("Indica template_key o template_version_id, no ambos");

  const rows = input.template_version_id
    ? await sql<{ id: string; subject: string; html_content: string; text_content: string }[]>`
        SELECT v.id, v.subject, v.html_content, v.text_content
        FROM template_versions v JOIN templates t ON t.id=v.template_id
        WHERE v.id=${input.template_version_id} AND t.channel='transactional' AND v.status IN ('published','draft')
      `
    : await sql<{ id: string; subject: string; html_content: string; text_content: string }[]>`
        SELECT v.id, v.subject, v.html_content, v.text_content
        FROM templates t JOIN template_versions v ON v.id=t.published_version_id
        WHERE t.key=${input.template_key ?? ""} AND t.channel='transactional' AND t.status='published'
      `;
  const template = rows[0];
  if (!template) throw new TransactionalError("La plantilla transaccional o su versión no existe o no está publicada", 404, "template_not_found");
  return {
    templateVersionId: template.id,
    subject: personalize(input.subject || template.subject, variables),
    html: personalize(template.html_content, variables),
    text: personalize(input.text || template.text_content, variables),
  };
}

export async function acceptTransactionalMessage(input: TransactionalSendInput, idempotencyKey: string, principal: { id: string; kind: "session" | "api_key" | "system" },placement?:{batchId:string;position:number}) {
  if (!idempotencyKey.trim()) throw new TransactionalError("Falta la cabecera Idempotency-Key");
  if (idempotencyKey.length > 200) throw new TransactionalError("Idempotency-Key es demasiado larga");
  if (Buffer.byteLength(JSON.stringify(input.metadata ?? {}), "utf8") > 20_000) throw new TransactionalError("metadata supera el límite de 20 KB", 413, "payload_too_large");

  const principalId = `${principal.kind}:${principal.id}`;
  const scope = `transactional:${principalId}`;
  const hash = requestHash(input);
  const [existing] = await sql<MessageRow[]>`
    SELECT * FROM outbound_messages WHERE idempotency_scope=${scope} AND idempotency_key=${idempotencyKey}
  `;
  if (existing) {
    if (existing.request_hash !== hash) throw new TransactionalError("Idempotency-Key ya se usó con otro contenido", 409, "idempotency_conflict");
    return { message: existing, duplicate: true };
  }

  const [suppression] = await sql<{ reason: string }[]>`
    SELECT reason FROM suppressions WHERE lower(email)=lower(${input.to.email}) AND scope IN ('transactional','all') AND status='active' LIMIT 1
  `;
  if (suppression) throw new TransactionalError(`Destinatario suprimido: ${suppression.reason}`, 422, "recipient_suppressed");
  const [matchedContact] = await sql<{id:string}[]>`
    SELECT id FROM contacts WHERE lower(email)=lower(${input.to.email})
      AND merged_into_contact_id IS NULL AND anonymized_at IS NULL LIMIT 1
  `;

  const config = await settings();
  if(config.global_sending_paused)throw new TransactionalError("Los envíos están pausados globalmente por un administrador",503,"sending_paused");
  const attachments=await resolveAttachments(input);
  const content = await resolveContent(input);
  const fromEmail = input.from?.email || config.default_from_email;
  const fromName = input.from?.name || config.default_from_name;
  const replyTo = input.reply_to ?? config.default_reply_to;
  for (const [value, name] of [[content.subject, "subject"], [fromEmail, "from.email"], [fromName, "from.name"], [replyTo, "reply_to"]] as const) ensureSafeHeader(value, name);
  if (!senderIsAllowed(fromEmail, config)) {
    throw new TransactionalError("El remitente no está en la lista permitida", 422, "sender_not_allowed");
  }
  validateHtml(content.html);

  const messageId = randomUUID();
  const trackOpens = input.track_opens ?? config.transactional_track_opens;
  const trackClicks = input.track_clicks ?? config.transactional_track_clicks;
  const localTrackingSource=(env.mailTransport??config.mail_transport)!=="ses"||config.ses_tracking_source==="local";
  const finalHtml = buildTransactionalTrackedHtml({ html: content.html, messageId, trackOpens:trackOpens&&localTrackingSource, trackClicks:trackClicks&&localTrackingSource });
  const finalText = content.text || htmlToText(content.html) || content.subject;
  const acceptedAt=new Date();
  const mime=await buildTransactionalMime({
    messageId,
    acceptedAt,
    from:{email:fromEmail,name:fromName},
    to:{email:input.to.email,name:input.to.name},
    replyTo,
    subject:content.subject,
    html:finalHtml,
    text:finalText,
    attachments:await resolvedAttachmentPayloads(attachments),
  });
  const mimeByteSize=validateMimeSize(mime);
  const storedVariables = JSON.parse(JSON.stringify(input.variables ?? {})) as never;
  const storedMetadata = JSON.parse(JSON.stringify(input.metadata ?? {})) as never;
  const expiresAt = config.content_retention_days > 0 ? new Date(Date.now() + config.content_retention_days * 86_400_000) : null;
  const [htmlBlob, textBlob,mimeBlob] = await Promise.all([
    storeContent(finalHtml, "text/html; charset=utf-8", expiresAt),
    storeContent(finalText, "text/plain; charset=utf-8", expiresAt),
    storeContent(mime, "message/rfc822", expiresAt),
  ]);

  let message: MessageRow;
  try {
    [message] = await sql.begin(async (tx) => {
      const [created] = await tx<MessageRow[]>`
        INSERT INTO outbound_messages (
          id, kind, contact_id, template_version_id, to_email, to_name, from_email, from_name, reply_to, subject,
          status, html_blob_id, text_blob_id, mime_blob_id, mime_byte_size, variables, metadata, track_opens, track_clicks,
          idempotency_scope, idempotency_key, request_hash, batch_id, batch_position, accepted_at, queued_at
        ) VALUES (
          ${messageId}, 'transactional', ${matchedContact?.id ?? null}, ${content.templateVersionId}, ${input.to.email}, ${input.to.name ?? ""},
          ${fromEmail}, ${fromName}, ${replyTo}, ${content.subject}, 'queued', ${htmlBlob.id}, ${textBlob.id}, ${mimeBlob.id}, ${mimeByteSize},
          ${tx.json(storedVariables)}, ${tx.json(storedMetadata)}, ${trackOpens}, ${trackClicks},
          ${scope}, ${idempotencyKey}, ${hash}, ${placement?.batchId??null}, ${placement?.position??null}, ${acceptedAt}, now()
        ) RETURNING *
      `;
      for(const attachment of attachments)await tx`INSERT INTO message_attachments(message_id,blob_id,asset_id,filename,content_type,disposition,content_id)VALUES(${messageId},NULL,${attachment.assetId},${attachment.filename},${attachment.contentType},${attachment.disposition},${attachment.contentId})`;
      await tx`
        INSERT INTO email_events (event_key, message_id, type, source, payload)
        VALUES
          (${eventKey({ messageId, type: "accepted" })}, ${messageId}, 'accepted', 'api', ${tx.json({ principal_id: principalId })}),
          (${eventKey({ messageId, type: "queued" })}, ${messageId}, 'queued', 'api', '{}'::jsonb)
      `;
      await tx`INSERT INTO audit_log (action, entity_type, entity_id, user_id, api_key_id, detail)
        VALUES ('accept', 'transactional_message', ${messageId}, ${principal.kind === "session" ? principal.id : null}, ${principal.kind === "api_key" ? principal.id : null}, ${tx.json({ to: input.to.email, template_version_id: content.templateVersionId,attachments:attachments.length,mime_byte_size:mimeByteSize,mime_limit_bytes:env.transactionalMimeMaxBytes,batch_id:placement?.batchId??null })})`;
      return [created];
    });
  } catch (error) {
    if ((error as { code?: string }).code !== "23505") throw error;
    const [concurrent] = await sql<MessageRow[]>`SELECT * FROM outbound_messages WHERE idempotency_scope=${scope} AND idempotency_key=${idempotencyKey}`;
    if (!concurrent || concurrent.request_hash !== hash) throw new TransactionalError("Idempotency-Key ya se usó con otro contenido", 409, "idempotency_conflict");
    return { message: concurrent, duplicate: true };
  }

  await getTransactionalQueue().add("send", { messageId }, { jobId: `transactional-${messageId}` });
  return { message, duplicate: false };
}

export async function acceptTransactionalBatch(inputs:TransactionalSendInput[],idempotencyKey:string,principal:{id:string;kind:"session"|"api_key"|"system"}){if(!idempotencyKey.trim())throw new TransactionalError("Falta la cabecera Idempotency-Key");if(idempotencyKey.length>200)throw new TransactionalError("Idempotency-Key es demasiado larga");const principalId=`${principal.kind}:${principal.id}`;const scope=`transactional-batch:${principalId}`;const hash=createHash("sha256").update(canonical(inputs)).digest("hex");let[batch]=await sql<{id:string;request_hash:string;status:string;result:unknown;created_at:Date}[]>`SELECT * FROM transactional_batches WHERE idempotency_scope=${scope} AND idempotency_key=${idempotencyKey}`;let duplicate=Boolean(batch);if(batch&&batch.request_hash!==hash)throw new TransactionalError("Idempotency-Key ya se usó con otro lote",409,"idempotency_conflict");if(batch?.status==="completed")return{batch,results:Array.isArray(batch.result)?batch.result as TransactionalBatchResult[]:[],duplicate:true};if(!batch){try{[batch]=await sql`INSERT INTO transactional_batches(idempotency_scope,idempotency_key,request_hash,total_count,created_by,api_key_id)VALUES(${scope},${idempotencyKey},${hash},${inputs.length},${principal.kind==="session"?principal.id:null},${principal.kind==="api_key"?principal.id:null})RETURNING *`;}catch(error){if((error as{code?:string}).code!=="23505")throw error;[batch]=await sql`SELECT * FROM transactional_batches WHERE idempotency_scope=${scope} AND idempotency_key=${idempotencyKey}`;duplicate=true;if(!batch||batch.request_hash!==hash)throw new TransactionalError("Idempotency-Key ya se usó con otro lote",409,"idempotency_conflict");}}
  const results:TransactionalBatchResult[]=[];for(const[index,input]of inputs.entries()){try{const accepted=await acceptTransactionalMessage(input,`${idempotencyKey}:${index}`,principal,{batchId:batch.id,position:index});results.push({index,id:accepted.message.id,status:accepted.message.status,duplicate:accepted.duplicate});}catch(error){if(error instanceof TransactionalError)results.push({index,error:{code:error.code,message:error.message}});else throw error;}}
  const acceptedCount=results.filter(item=>item.id).length;const failedCount=results.length-acceptedCount;const stored=JSON.parse(JSON.stringify(results)) as never;[batch]=await sql`UPDATE transactional_batches SET status='completed',accepted_count=${acceptedCount},failed_count=${failedCount},result=${sql.json(stored)},completed_at=now() WHERE id=${batch.id} RETURNING *`;await sql`INSERT INTO audit_log(action,entity_type,entity_id,user_id,api_key_id,detail)VALUES('accept','transactional_batch',${batch.id},${principal.kind==="session"?principal.id:null},${principal.kind==="api_key"?principal.id:null},${sql.json({total:inputs.length,accepted:acceptedCount,failed:failedCount})})`;return{batch,results,duplicate};
}

export async function retryTransactionalMessage(sourceId:string,idempotencyKey:string,principal:{id:string;kind:"session"|"api_key"|"system"}) {
  if(!idempotencyKey.trim())throw new TransactionalError("Falta la cabecera Idempotency-Key");
  if(idempotencyKey.length>200)throw new TransactionalError("Idempotency-Key es demasiado larga");
  const scope=`transactional-retry:${principal.kind}:${principal.id}`;
  const hash=createHash("sha256").update(sourceId).digest("hex");
  const[existing]=await sql<MessageRow[]>`SELECT * FROM outbound_messages WHERE idempotency_scope=${scope} AND idempotency_key=${idempotencyKey}`;
  if(existing){if(existing.request_hash!==hash)throw new TransactionalError("Idempotency-Key ya se usó para otro reintento",409,"idempotency_conflict");return{message:existing,duplicate:true};}
  const[source]=await sql<MessageRow[]>`SELECT * FROM outbound_messages WHERE id=${sourceId} AND kind='transactional'`;
  if(!source)throw new TransactionalError("Mensaje no encontrado",404,"not_found");
  const config=await settings();
  if(config.global_sending_paused)throw new TransactionalError("Los envíos están pausados globalmente por un administrador",503,"sending_paused");
  if(!senderIsAllowed(source.from_email,config))throw new TransactionalError("El remitente no está en la lista permitida",422,"sender_not_allowed");
  if(source.status!=="failed"||source.ses_message_id)throw new TransactionalError("Solo se puede reintentar un fallo sin aceptación del proveedor",409,"retry_not_allowed");

  const [htmlResult,textResult,attachments]=await Promise.all([
    source.html_blob_id?readContent(source.html_blob_id):null,
    source.text_blob_id?readContent(source.text_blob_id):null,
    attachmentPayloads(sourceId),
  ]);
  if(!htmlResult)throw new TransactionalError("El contenido original ya no está disponible",410,"content_expired");
  const messageId=randomUUID();
  const acceptedAt=new Date();
  const mime=await buildTransactionalMime({
    messageId,
    acceptedAt,
    from:{email:source.from_email,name:source.from_name},
    to:{email:source.to_email,name:source.to_name},
    replyTo:source.reply_to,
    subject:source.subject,
    html:htmlResult.content.toString("utf8"),
    text:textResult?.content.toString("utf8")||source.subject,
    attachments:attachments.map(item=>({filename:item.filename,content:item.content,contentType:item.content_type,disposition:item.disposition,contentId:item.content_id})),
  });
  const mimeByteSize=validateMimeSize(mime);
  const expiresAt=config.content_retention_days>0?new Date(Date.now()+config.content_retention_days*86_400_000):null;
  const mimeBlob=await storeContent(mime,"message/rfc822",expiresAt);

  let message:MessageRow;
  try{
    [message]=await sql.begin(async tx=>{
      const[created]=await tx<MessageRow[]>`
        INSERT INTO outbound_messages(
          id,kind,contact_id,template_version_id,to_email,to_name,from_email,from_name,reply_to,subject,status,
          html_blob_id,text_blob_id,mime_blob_id,mime_byte_size,variables,metadata,track_opens,track_clicks,
          idempotency_scope,idempotency_key,request_hash,retry_of_message_id,accepted_at,queued_at
        )
        SELECT ${messageId},kind,contact_id,template_version_id,to_email,to_name,from_email,from_name,reply_to,subject,'queued',
          html_blob_id,text_blob_id,${mimeBlob.id},${mimeByteSize},variables,metadata,track_opens,track_clicks,
          ${scope},${idempotencyKey},${hash},id,${acceptedAt},now()
        FROM outbound_messages WHERE id=${sourceId} RETURNING *
      `;
      await tx`INSERT INTO message_attachments(message_id,blob_id,asset_id,filename,content_type,disposition,content_id)SELECT ${messageId},blob_id,asset_id,filename,content_type,disposition,content_id FROM message_attachments WHERE message_id=${sourceId}`;
      await tx`INSERT INTO email_events(event_key,message_id,type,source,payload)VALUES(${eventKey({messageId,type:"accepted"})},${messageId},'accepted','manual_retry',${tx.json({retry_of:sourceId,mime_byte_size:mimeByteSize})}),(${eventKey({messageId,type:"queued"})},${messageId},'queued','manual_retry',${tx.json({retry_of:sourceId})})`;
      await tx`INSERT INTO audit_log(action,entity_type,entity_id,user_id,api_key_id,detail)VALUES('retry','transactional_message',${messageId},${principal.kind==="session"?principal.id:null},${principal.kind==="api_key"?principal.id:null},${tx.json({retry_of:sourceId,mime_byte_size:mimeByteSize})})`;
      return[created];
    });
  }catch(error){
    if((error as{code?:string}).code!=="23505")throw error;
    const[concurrent]=await sql<MessageRow[]>`SELECT * FROM outbound_messages WHERE idempotency_scope=${scope} AND idempotency_key=${idempotencyKey}`;
    if(!concurrent||concurrent.request_hash!==hash)throw new TransactionalError("Idempotency-Key ya se usó para otro reintento",409,"idempotency_conflict");
    return{message:concurrent,duplicate:true};
  }
  await getTransactionalQueue().add("send",{messageId},{jobId:`transactional-${messageId}`});
  return{message,duplicate:false};
}

export async function sendTransactionalMessage(messageId: string) {
  const [message] = await sql<(MessageRow & { configuration_set: string; configured_transport: "smtp" | "ses";aws_region:string;global_sending_paused:boolean })[]>`
    SELECT m.*, COALESCE(NULLIF(s.ses_transactional_configuration_set,''),s.ses_configuration_set) AS configuration_set,
      s.mail_transport AS configured_transport,s.aws_region,s.global_sending_paused
    FROM outbound_messages m CROSS JOIN settings s
    WHERE m.id=${messageId} AND m.kind='transactional'
  `;
  if (!message || !["queued", "processing"].includes(message.status) || message.ses_message_id) return { skipped: true };
  if(message.global_sending_paused)return{skipped:true,paused:true};
  const [suppression] = await sql<{ reason: string }[]>`
    SELECT reason FROM suppressions WHERE lower(email)=lower(${message.to_email}) AND scope IN ('transactional','all') AND status='active' LIMIT 1
  `;
  if (suppression) throw new TransactionalError(`Destinatario suprimido: ${suppression.reason}`, 422, "recipient_suppressed");
  const [htmlResult, textResult,mimeResult] = await Promise.all([
    readContent(message.html_blob_id),
    message.text_blob_id ? readContent(message.text_blob_id) : null,
    message.mime_blob_id ? readContent(message.mime_blob_id) : null,
  ]);
  if (!htmlResult) throw new Error("No se encuentra el HTML persistido");
  const html = htmlResult.content.toString("utf8");
  const text = textResult?.content.toString("utf8") || message.subject;
  const attachments=await attachmentPayloads(messageId);
  let mime=mimeResult?.content;
  if(!mime){
    mime=await buildTransactionalMime({
      messageId,
      acceptedAt:new Date(message.accepted_at),
      from:{email:message.from_email,name:message.from_name},
      to:{email:message.to_email,name:message.to_name},
      replyTo:message.reply_to,
      subject:message.subject,
      html,
      text,
      attachments:attachments.map(item=>({filename:item.filename,content:item.content,contentType:item.content_type,disposition:item.disposition,contentId:item.content_id})),
    });
    const legacyMimeByteSize=validateMimeSize(mime);
    const mimeBlob=await storeContent(mime,"message/rfc822");
    await sql`UPDATE outbound_messages SET mime_blob_id=${mimeBlob.id},mime_byte_size=${legacyMimeByteSize},updated_at=now() WHERE id=${messageId}`;
  }
  const mimeByteSize=validateMimeSize(mime);
  if(message.mime_byte_size!==null&&Number(message.mime_byte_size)!==mimeByteSize)throw new Error("El MIME persistido no coincide con el tamaño registrado");
  const [claimed] = await sql<{ id: string;attempt_count:number }[]>`
    UPDATE outbound_messages SET status='processing', attempt_count=attempt_count+1, processed_at=COALESCE(processed_at,now()), updated_at=now()
    WHERE id=${messageId} AND status IN ('queued','processing') AND ses_message_id IS NULL RETURNING id,attempt_count
  `;
  if (!claimed) return { skipped: true };
  await sql`
    INSERT INTO email_events (event_key, message_id, type, source, payload)
    VALUES (${eventKey({ messageId, type: "processed" })}, ${messageId}, 'processed', 'worker', '{}')
    ON CONFLICT (event_key) DO NOTHING
  `;

  const selectedTransport = env.mailTransport || message.configured_transport;
  const[attempt]=await sql<{id:string}[]>`INSERT INTO message_send_attempts(message_id,attempt_number,kind,transport)VALUES(${messageId},${claimed.attempt_count},${message.retry_of_message_id?"manual_retry":"automatic"},${selectedTransport})RETURNING id`;
  await sql`INSERT INTO email_events(event_key,message_id,type,source,payload)VALUES(${eventKey({messageId,type:"send_attempted",attempt:claimed.attempt_count})},${messageId},'send_attempted','worker',${sql.json({attempt:claimed.attempt_count,transport:selectedTransport,attachments:attachments.length,mime_byte_size:mimeByteSize})})ON CONFLICT(event_key)DO NOTHING`;
  let providerMessageId = "";
  try{
    if (selectedTransport === "ses") {
      const response = await ses(env.awsRegion??message.aws_region).send(new SendEmailCommand({
        FromEmailAddress: message.from_email,
        Destination: { ToAddresses: [message.to_email] },
        ConfigurationSetName: message.configuration_set || undefined,
        EmailTags: [{ Name: "message_id", Value: message.id }, { Name: "channel", Value: "transactional" },...(message.template_version_id?[{Name:"template_version_id",Value:message.template_version_id}]:[])],
        Content: { Raw: { Data:mime } },
      }));
      providerMessageId = response.MessageId ?? "";
    } else {
      const response = await smtp().sendMail({
        raw:mime,
        envelope:{from:message.from_email,to:message.to_email},
      });
      providerMessageId = response.messageId;
    }
  }catch(error){await sql`UPDATE message_send_attempts SET status='failed',error_code='transport_error',error_message=${String(error).slice(0,500)},finished_at=now() WHERE id=${attempt.id}`;throw error;}

  const delivered = selectedTransport === "smtp";
  await sql.begin(async (tx) => {
    await tx`
      UPDATE outbound_messages SET status=${delivered ? "delivered" : "sent"}, ses_message_id=${providerMessageId},
        sent_at=now(), delivered_at=${delivered ? new Date() : null}, failure_code=NULL, failure_reason=NULL, updated_at=now()
      WHERE id=${messageId}
    `;
    await tx`UPDATE message_send_attempts SET status='succeeded',provider_message_id=${providerMessageId},finished_at=now() WHERE id=${attempt.id}`;
    await tx`
      INSERT INTO email_events (event_key, message_id, type, ses_message_id, source, payload)
      VALUES (${eventKey({ messageId, type: "sent", providerMessageId })}, ${messageId}, 'sent', ${providerMessageId}, ${selectedTransport}, ${tx.json({ transport: selectedTransport })})
      ON CONFLICT (event_key) DO NOTHING
    `;
    if (delivered) await tx`
      INSERT INTO email_events (event_key, message_id, type, ses_message_id, source, payload)
      VALUES (${eventKey({ messageId, type: "delivered", providerMessageId })}, ${messageId}, 'delivered', ${providerMessageId}, 'smtp', '{"local":true}')
      ON CONFLICT (event_key) DO NOTHING
    `;
  });
  return { messageId: providerMessageId };
}

export async function markTransactionalFailed(messageId: string, error: Error) {
  const [message] = await sql<{ status: string }[]>`
    UPDATE outbound_messages SET status='failed', failure_code='worker_error', failure_reason=${error.message.slice(0, 500)}, updated_at=now()
    WHERE id=${messageId} AND status NOT IN ('sent','delivered') RETURNING status
  `;
  if (message) await sql`
    INSERT INTO email_events (event_key, message_id, type, source, payload)
    VALUES (${eventKey({ messageId, type: "failed" })}, ${messageId}, 'failed', 'worker', ${sql.json({ error: error.message.slice(0, 500) })})
    ON CONFLICT (event_key) DO NOTHING
  `;
}

export async function recoverQueuedTransactionalMessages() {
  const messages = await sql<{ id: string }[]>`
    SELECT id FROM outbound_messages
    WHERE kind='transactional' AND (
      status='queued' OR (status='processing' AND ses_message_id IS NULL AND updated_at < now() - interval '5 minutes')
    ) ORDER BY created_at LIMIT 10000
  `;
  const runId=randomUUID();
  await getTransactionalQueue().addBulk(messages.map(({ id }) => ({ name: "send", data: { messageId: id }, opts: { jobId: `transactional-${id}-recover-${runId}` } })));
}
