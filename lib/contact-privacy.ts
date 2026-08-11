import { createHash } from "node:crypto";
import { sql } from "./db";

export type ContactActor = { userId?: string | null; apiKeyId?: string | null };
export type MergeFieldStrategy = "target" | "source" | "fill_empty";

type ContactRow = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone: string;
  status: "active" | "bounced" | "complained" | "blocked";
  source: string;
  custom_fields: Record<string, unknown>;
  language: string;
  timezone: string;
  merged_into_contact_id: string | null;
  anonymized_at: Date | null;
};

type SubscriptionRow = {
  id: string;
  list_id: string;
  status: "pending" | "active" | "unsubscribed" | "archived";
  source: string;
  custom_values: Record<string, unknown>;
  subscribed_at: Date | null;
  confirmed_at: Date | null;
  unsubscribed_at: Date | null;
  reactivated_at: Date | null;
  consent_text: string;
  consent_ip: string | null;
  consent_user_agent: string;
};

export class ContactPrivacyError extends Error {
  constructor(message: string, public status = 409, public code = "contact_privacy_conflict") {
    super(message);
  }
}

function anonymousEmail(id: string, email: string, kind: "privacy" | "merged") {
  const digest = createHash("sha256").update(`${kind}:${id}:${email}`).digest("hex").slice(0, 28);
  return `${kind}-${digest}@invalid.local`;
}

function earliest(...values: Array<Date | null>) {
  return values.filter((value): value is Date => Boolean(value)).sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
}

function latest(...values: Array<Date | null>) {
  return values.filter((value): value is Date => Boolean(value)).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
}

export function conservativeSubscriptionStatus(...values: SubscriptionRow["status"][]) {
  for (const status of ["unsubscribed", "archived", "pending", "active"] as const) if (values.includes(status)) return status;
  return "pending" as const;
}

function conservativeContactStatus(...values: ContactRow["status"][]) {
  for (const status of ["blocked", "complained", "bounced", "active"] as const) if (values.includes(status)) return status;
  return "blocked" as const;
}

function selectedContactFields(source: ContactRow, target: ContactRow, strategy: MergeFieldStrategy) {
  if (strategy === "source") return {
    first_name: source.first_name, last_name: source.last_name, phone: source.phone,
    language: source.language, timezone: source.timezone,
    custom_fields: { ...(target.custom_fields ?? {}), ...(source.custom_fields ?? {}) },
  };
  if (strategy === "fill_empty") return {
    first_name: target.first_name || source.first_name,
    last_name: target.last_name || source.last_name,
    phone: target.phone || source.phone,
    language: target.language || source.language,
    timezone: target.timezone || source.timezone,
    custom_fields: { ...(source.custom_fields ?? {}), ...(target.custom_fields ?? {}) },
  };
  return {
    first_name: target.first_name, last_name: target.last_name, phone: target.phone,
    language: target.language, timezone: target.timezone, custom_fields: target.custom_fields ?? {},
  };
}

export async function findIrreversibleSuppression(email: string) {
  const [suppression] = await sql<{ id: string; reason: "privacy" | "merged" }[]>`
    SELECT id,reason FROM suppressions
    WHERE lower(email)=lower(${email}) AND scope='all' AND status='active' AND reason IN ('privacy','merged')
    LIMIT 1
  `;
  return suppression ?? null;
}

export async function assertEmailMayBeStored(email: string) {
  const suppression = await findIrreversibleSuppression(email);
  if (suppression) throw new ContactPrivacyError(
    "Este correo está protegido por una solicitud de privacidad y no se puede volver a incorporar.",
    409,
    "privacy_suppressed",
  );
}

export async function exportContactData(contactId: string, actor: ContactActor = {}) {
  const [contact] = await sql<ContactRow[]>`
    SELECT * FROM contacts WHERE id=${contactId} AND merged_into_contact_id IS NULL
  `;
  if (!contact) throw new ContactPrivacyError("Contacto no encontrado", 404, "not_found");
  if (contact.anonymized_at) throw new ContactPrivacyError("El contacto ya está anonimizado", 410, "contact_anonymized");

  const mergedSources = await sql<{ source_contact_id: string; source_email_hash: string; merged_at: Date; reason: string }[]>`
    SELECT source_contact_id,source_email_hash,merged_at,reason FROM contact_merges
    WHERE survivor_contact_id=${contactId} ORDER BY merged_at
  `;
  const relatedIds = [contactId, ...mergedSources.map((item) => item.source_contact_id).filter(Boolean)];
  const [subscriptions, consent, tags, messages, campaignRecipients, suppressions, privacyRequests, merges] = await Promise.all([
    sql`SELECT s.*,l.key AS list_key,l.name AS list_name FROM subscriptions s JOIN lists l ON l.id=s.list_id WHERE s.contact_id=${contactId} ORDER BY s.created_at`,
    sql`SELECT ce.*,l.key AS list_key,l.name AS list_name FROM consent_events ce JOIN lists l ON l.id=ce.list_id WHERE ce.contact_id=${contactId} ORDER BY ce.occurred_at`,
    sql`SELECT t.id,t.name,t.color,ct.created_at FROM contact_tags ct JOIN tags t ON t.id=ct.tag_id WHERE ct.contact_id=${contactId} ORDER BY t.name`,
    sql`SELECT m.id,m.kind,m.to_email,m.to_name,m.from_email,m.from_name,m.reply_to,m.subject,m.status,m.variables,m.metadata,m.ses_message_id,m.accepted_at,m.sent_at,m.delivered_at,m.created_at,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('type',e.type,'source',e.source,'link_url',e.link_url,'occurred_at',e.occurred_at,'payload',e.payload) ORDER BY e.occurred_at) FROM email_events e WHERE e.message_id=m.id),'[]'::jsonb) AS events
      FROM outbound_messages m WHERE m.contact_id=ANY(${relatedIds}::uuid[]) OR lower(m.to_email)=lower(${contact.email}) ORDER BY m.created_at`,
    sql`SELECT id,campaign_id,contact_id,email,status,ses_message_id,created_at FROM campaign_recipients WHERE contact_id=ANY(${relatedIds}::uuid[]) OR lower(email)=lower(${contact.email}) ORDER BY created_at`,
    sql`SELECT id,email,reason,source,scope,status,detail,created_at,updated_at,resolved_at FROM suppressions WHERE lower(email)=lower(${contact.email}) OR detail->>'survivor_contact_id'=${contactId} ORDER BY created_at`,
    sql`SELECT id,kind,status,reason,detail,requested_at,completed_at FROM privacy_requests WHERE contact_id=${contactId} ORDER BY requested_at`,
    sql`SELECT id,source_email_hash,field_strategy,reason,detail,merged_at FROM contact_merges WHERE survivor_contact_id=${contactId} ORDER BY merged_at`,
  ]);

  const [request] = await sql<{ id: string; requested_at: Date; completed_at: Date }[]>`
    INSERT INTO privacy_requests(contact_id,kind,status,requested_by_user_id,requested_by_api_key_id,reason,detail,completed_at)
    VALUES(${contactId},'export','completed',${actor.userId ?? null},${actor.apiKeyId ?? null},'Exportación individual',${sql.json({ format: "json", merged_sources: mergedSources.length })},now())
    RETURNING id,requested_at,completed_at
  `;
  await sql`INSERT INTO audit_log(action,entity_type,entity_id,user_id,api_key_id,detail) VALUES('privacy_export','contact',${contactId},${actor.userId ?? null},${actor.apiKeyId ?? null},${sql.json({ privacy_request_id: request.id })})`;

  return {
    export: { request_id: request.id, generated_at: request.completed_at, format: "kiromail-contact-v1" },
    contact,
    subscriptions,
    consent_events: consent,
    tags,
    outbound_messages: messages,
    campaign_recipients: campaignRecipients,
    suppressions,
    privacy_requests: [...privacyRequests, request],
    merges,
  };
}

export async function anonymizeContact(contactId: string, reason: string, actor: ContactActor = {}) {
  if (!reason.trim()) throw new ContactPrivacyError("Indica el motivo de la anonimización", 422, "reason_required");
  return sql.begin(async (tx) => {
    const [contact] = await tx<ContactRow[]>`SELECT * FROM contacts WHERE id=${contactId} FOR UPDATE`;
    if (!contact) throw new ContactPrivacyError("Contacto no encontrado", 404, "not_found");
    if (contact.merged_into_contact_id) throw new ContactPrivacyError("El contacto ya fue fusionado", 409, "contact_merged");
    if (contact.anonymized_at) return { status: "anonymized" as const, id: contact.id, already_anonymized: true };
    const replacement = anonymousEmail(contact.id, contact.email, "privacy");
    const [request] = await tx<{ id: string }[]>`
      INSERT INTO privacy_requests(contact_id,kind,status,requested_by_user_id,requested_by_api_key_id,reason)
      VALUES(${contact.id},'anonymize','requested',${actor.userId ?? null},${actor.apiKeyId ?? null},${reason.trim()}) RETURNING id
    `;
    await tx`
      INSERT INTO suppressions(email,reason,source,scope,detail)
      VALUES(${contact.email},'privacy','privacy_request','all',${tx.json({ privacy_request_id: request.id })})
      ON CONFLICT(lower(email),scope) DO UPDATE SET reason='privacy',source='privacy_request',detail=EXCLUDED.detail,
        status='active',resolved_at=NULL,resolved_by=NULL,resolution_note='',updated_at=now()
    `;
    await tx`UPDATE public_tokens SET revoked_at=COALESCE(revoked_at,now()) WHERE contact_id=${contact.id}`;
    await tx`DELETE FROM tracked_links WHERE message_id IN (SELECT id FROM outbound_messages WHERE contact_id=${contact.id} OR lower(to_email)=lower(${contact.email}))`;
    await tx`DELETE FROM message_attachments WHERE message_id IN (SELECT id FROM outbound_messages WHERE contact_id=${contact.id} OR lower(to_email)=lower(${contact.email}))`;
    await tx`UPDATE message_send_attempts SET error_message=CASE WHEN error_message IS NULL THEN NULL ELSE '[redactado por privacidad]' END WHERE message_id IN (SELECT id FROM outbound_messages WHERE contact_id=${contact.id} OR lower(to_email)=lower(${contact.email}))`;
    await tx`UPDATE subscriptions SET status='archived',custom_values='{}',consent_text='Registro anonimizado',consent_ip=NULL,consent_user_agent='',updated_at=now() WHERE contact_id=${contact.id}`;
    await tx`UPDATE consent_events SET consent_text='Registro anonimizado',ip=NULL,user_agent='',detail='{}' WHERE contact_id=${contact.id}`;
    await tx`UPDATE email_events SET link_url=NULL,payload='{"privacy_redacted":true}' WHERE contact_id=${contact.id} OR message_id IN (SELECT id FROM outbound_messages WHERE lower(to_email)=lower(${contact.email}))`;
    await tx`UPDATE outbound_messages SET contact_id=${contact.id},to_email=${replacement},to_name='',subject='[redactado por privacidad]',variables='{}',metadata='{"privacy_redacted":true}',html_blob_id=NULL,text_blob_id=NULL,mime_blob_id=NULL,mime_byte_size=NULL,failure_reason=CASE WHEN failure_reason IS NULL THEN NULL ELSE '[redactado por privacidad]' END,updated_at=now() WHERE contact_id=${contact.id} OR lower(to_email)=lower(${contact.email})`;
    await tx`UPDATE campaign_recipients SET email=${replacement},personalization='{}',failure_reason=CASE WHEN failure_reason IS NULL THEN NULL ELSE '[redactado por privacidad]' END WHERE contact_id=${contact.id} OR lower(email)=lower(${contact.email})`;
    await tx`UPDATE campaign_exclusions SET email=${replacement},detail='{"privacy_redacted":true}' WHERE contact_id=${contact.id} OR lower(email)=lower(${contact.email})`;
    await tx`UPDATE import_rejections SET email=${replacement},row_data='{}' WHERE lower(email)=lower(${contact.email})`;
    await tx`UPDATE webhook_deliveries SET payload='{"privacy_redacted":true}' WHERE payload::text ILIKE '%'||${contact.email}||'%'`;
    await tx`UPDATE dead_letter_items SET payload='{"privacy_redacted":true}',error='[redactado por privacidad]' WHERE payload::text ILIKE '%'||${contact.email}||'%'`;
    await tx`DELETE FROM contact_tags WHERE contact_id=${contact.id}`;
    await tx`UPDATE audit_log SET detail='{"privacy_redacted":true}' WHERE entity_type='contact' AND entity_id=${contact.id}`;
    await tx`UPDATE contacts SET email=${replacement},first_name='',last_name='',phone='',status='blocked',source='privacy_anonymized',custom_fields='{}',language='',timezone='',last_activity_at=NULL,anonymized_at=now(),updated_at=now() WHERE id=${contact.id}`;
    await tx`UPDATE privacy_requests SET status='completed',detail=${tx.json({ original_email_sha256: createHash("sha256").update(contact.email.toLowerCase()).digest("hex") })},completed_at=now() WHERE id=${request.id}`;
    await tx`INSERT INTO audit_log(action,entity_type,entity_id,user_id,api_key_id,detail) VALUES('anonymize','contact',${contact.id},${actor.userId ?? null},${actor.apiKeyId ?? null},${tx.json({ reason: reason.trim(), privacy_request_id: request.id })})`;
    return { status: "anonymized" as const, id: contact.id, privacy_request_id: request.id };
  });
}

export async function mergeContacts(sourceContactId: string, survivorContactId: string, strategy: MergeFieldStrategy, reason: string, actor: ContactActor = {}) {
  if (sourceContactId === survivorContactId) throw new ContactPrivacyError("El origen y el superviviente deben ser distintos", 422, "same_contact");
  if (!reason.trim()) throw new ContactPrivacyError("Indica el motivo de la fusión", 422, "reason_required");
  return sql.begin(async (tx) => {
    const rows = await tx<ContactRow[]>`SELECT * FROM contacts WHERE id IN (${sourceContactId},${survivorContactId}) ORDER BY id FOR UPDATE`;
    const source = rows.find((item) => item.id === sourceContactId);
    const target = rows.find((item) => item.id === survivorContactId);
    if (!source || !target) throw new ContactPrivacyError("Uno de los contactos no existe", 404, "not_found");
    if (source.merged_into_contact_id || target.merged_into_contact_id) throw new ContactPrivacyError("No se puede fusionar un contacto que ya es un duplicado", 409, "contact_merged");
    if (source.anonymized_at || target.anonymized_at) throw new ContactPrivacyError("No se puede fusionar un contacto anonimizado", 409, "contact_anonymized");

    const fields = selectedContactFields(source, target, strategy);
    const sourceSubscriptions = await tx<SubscriptionRow[]>`SELECT * FROM subscriptions WHERE contact_id=${source.id} ORDER BY list_id FOR UPDATE`;
    const targetSubscriptions = await tx<SubscriptionRow[]>`SELECT * FROM subscriptions WHERE contact_id=${target.id} ORDER BY list_id FOR UPDATE`;
    const targetByList = new Map(targetSubscriptions.map((item) => [item.list_id, item]));
    let collapsedSubscriptions = 0;
    for (const sourceSubscription of sourceSubscriptions) {
      const targetSubscription = targetByList.get(sourceSubscription.list_id);
      if (!targetSubscription) {
        await tx`UPDATE subscriptions SET contact_id=${target.id},updated_at=now() WHERE id=${sourceSubscription.id}`;
        continue;
      }
      collapsedSubscriptions++;
      const nextStatus = conservativeSubscriptionStatus(sourceSubscription.status, targetSubscription.status);
      const customValues = JSON.parse(JSON.stringify({ ...(sourceSubscription.custom_values ?? {}), ...(targetSubscription.custom_values ?? {}) })) as never;
      await tx`UPDATE subscriptions SET status=${nextStatus},custom_values=${tx.json(customValues)},
        subscribed_at=${earliest(sourceSubscription.subscribed_at,targetSubscription.subscribed_at)},
        confirmed_at=${earliest(sourceSubscription.confirmed_at,targetSubscription.confirmed_at)},
        unsubscribed_at=${latest(sourceSubscription.unsubscribed_at,targetSubscription.unsubscribed_at)},
        reactivated_at=${latest(sourceSubscription.reactivated_at,targetSubscription.reactivated_at)},updated_at=now()
        WHERE id=${targetSubscription.id}`;
      await tx`UPDATE consent_events SET contact_id=${target.id},subscription_id=${targetSubscription.id} WHERE subscription_id=${sourceSubscription.id}`;
      await tx`UPDATE background_job_changes SET contact_id=${target.id},subscription_id=${targetSubscription.id} WHERE subscription_id=${sourceSubscription.id}`;
      await tx`UPDATE outbound_messages SET contact_id=${target.id},subscription_id=${targetSubscription.id},updated_at=now() WHERE subscription_id=${sourceSubscription.id}`;
      await tx`UPDATE campaign_recipients SET subscription_id=${targetSubscription.id} WHERE subscription_id=${sourceSubscription.id} AND NOT EXISTS (SELECT 1 FROM campaign_recipients other WHERE other.campaign_id=campaign_recipients.campaign_id AND other.subscription_id=${targetSubscription.id})`;
      await tx`UPDATE campaign_recipients SET subscription_id=NULL WHERE subscription_id=${sourceSubscription.id}`;
      await tx`UPDATE campaign_exclusions SET subscription_id=NULL WHERE subscription_id=${sourceSubscription.id}`;
      await tx`UPDATE public_tokens SET contact_id=${target.id},subscription_id=NULL,revoked_at=COALESCE(revoked_at,now()) WHERE subscription_id=${sourceSubscription.id}`;
      await tx`DELETE FROM subscriptions WHERE id=${sourceSubscription.id}`;
    }

    await tx`INSERT INTO contact_tags(contact_id,tag_id) SELECT ${target.id},tag_id FROM contact_tags WHERE contact_id=${source.id} ON CONFLICT DO NOTHING`;
    await tx`DELETE FROM contact_tags WHERE contact_id=${source.id}`;
    await tx`UPDATE consent_events SET contact_id=${target.id} WHERE contact_id=${source.id}`;
    await tx`UPDATE background_job_changes SET contact_id=${target.id} WHERE contact_id=${source.id}`;
    await tx`UPDATE outbound_messages SET contact_id=${target.id},updated_at=now() WHERE contact_id=${source.id}`;
    await tx`UPDATE email_events SET contact_id=${target.id} WHERE contact_id=${source.id}`;
    await tx`UPDATE campaign_exclusions SET contact_id=${target.id} WHERE contact_id=${source.id}`;
    await tx`UPDATE campaign_recipients SET contact_id=${target.id} WHERE contact_id=${source.id} AND NOT EXISTS (SELECT 1 FROM campaign_recipients other WHERE other.campaign_id=campaign_recipients.campaign_id AND other.contact_id=${target.id})`;
    await tx`UPDATE campaign_recipients SET contact_id=NULL WHERE contact_id=${source.id}`;
    await tx`UPDATE public_tokens SET contact_id=${target.id},subscription_id=NULL,revoked_at=COALESCE(revoked_at,now()) WHERE contact_id=${source.id}`;

    const storedContactFields=JSON.parse(JSON.stringify(fields.custom_fields)) as never;
    await tx`UPDATE contacts SET first_name=${fields.first_name},last_name=${fields.last_name},phone=${fields.phone},language=${fields.language},timezone=${fields.timezone},custom_fields=${tx.json(storedContactFields)},status=${conservativeContactStatus(source.status,target.status)},updated_at=now() WHERE id=${target.id}`;
    await tx`INSERT INTO suppressions(email,reason,source,scope,detail) VALUES(${source.email},'merged','contact_merge','all',${tx.json({ survivor_contact_id: target.id })}) ON CONFLICT(lower(email),scope) DO UPDATE SET reason='merged',source='contact_merge',detail=EXCLUDED.detail,status='active',resolved_at=NULL,resolved_by=NULL,resolution_note='',updated_at=now()`;
    const replacement = anonymousEmail(source.id, source.email, "merged");
    await tx`UPDATE contacts SET email=${replacement},first_name='',last_name='',phone='',status='blocked',source='merged_duplicate',custom_fields='{}',language='',timezone='',last_activity_at=NULL,merged_into_contact_id=${target.id},merged_at=now(),updated_at=now() WHERE id=${source.id}`;
    const [merge] = await tx<{ id: string }[]>`
      INSERT INTO contact_merges(source_contact_id,survivor_contact_id,source_email_hash,field_strategy,reason,detail,user_id,api_key_id)
      VALUES(${source.id},${target.id},${createHash("sha256").update(source.email.toLowerCase()).digest("hex")},${strategy},${reason.trim()},${tx.json({ source_subscriptions: sourceSubscriptions.length, collapsed_subscriptions: collapsedSubscriptions })},${actor.userId ?? null},${actor.apiKeyId ?? null}) RETURNING id
    `;
    await tx`INSERT INTO audit_log(action,entity_type,entity_id,user_id,api_key_id,detail) VALUES('merge_source','contact',${source.id},${actor.userId ?? null},${actor.apiKeyId ?? null},${tx.json({ merge_id: merge.id, survivor_contact_id: target.id, reason: reason.trim() })})`;
    await tx`INSERT INTO audit_log(action,entity_type,entity_id,user_id,api_key_id,detail) VALUES('merge_survivor','contact',${target.id},${actor.userId ?? null},${actor.apiKeyId ?? null},${tx.json({ merge_id: merge.id, source_contact_id: source.id, reason: reason.trim() })})`;
    return { status: "merged" as const, merge_id: merge.id, source_contact_id: source.id, survivor_contact_id: target.id, collapsed_subscriptions: collapsedSubscriptions };
  });
}
