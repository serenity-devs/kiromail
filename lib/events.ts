import { sql } from "./db";
import { eventKey } from "./email";
import { recomputeCampaignStats } from "./campaign-service";
import { env } from "./config";

export function isAutomatedInteraction(userAgent:string|null|undefined,purpose?:string|null){
  const signal=`${userAgent??""} ${purpose??""}`.toLowerCase();
  return /(bot|crawler|spider|scanner|preview|prefetch|proofpoint|mimecast|barracuda|safelinks|urlscan|security|antivirus|headless|curl|wget)/.test(signal);
}

export async function recordRecipientEvent(recipientId: string, type: string, payload: unknown = {}, linkUrl?: string,isAutomated=false) {
  const [recipient] = await sql<{ campaign_id: string; contact_id: string | null; email: string; ses_message_id: string | null; outbound_message_id: string | null;ses_tracking_source:string;mail_transport:"smtp"|"ses" }[]>`
    SELECT cr.campaign_id, cr.contact_id, cr.email, cr.ses_message_id, cr.outbound_message_id,s.ses_tracking_source,s.mail_transport FROM campaign_recipients cr CROSS JOIN settings s WHERE cr.id = ${recipientId}
  `;
  if (!recipient||(["open","click"].includes(type)&&(env.mailTransport??recipient.mail_transport)==="ses"&&recipient.ses_tracking_source!=="local")) return false;
  const key = eventKey({ type, recipientId, payload, linkUrl, nonce: crypto.randomUUID() });
  const storedPayload = JSON.parse(JSON.stringify(payload)) as never;

  await sql.begin(async (tx) => {
    await tx`
      INSERT INTO email_events (event_key, message_id, recipient_id, campaign_id, contact_id, type, ses_message_id, link_url, source, payload,is_automated)
      VALUES (${key}, ${recipient.outbound_message_id}, ${recipientId}, ${recipient.campaign_id}, ${recipient.contact_id}, ${type}, ${recipient.ses_message_id}, ${linkUrl ?? null}, 'local', ${tx.json(storedPayload)},${isAutomated})
    `;
    if (type === "open") {
      await tx`UPDATE campaign_recipients SET opened_at=COALESCE(opened_at,now()), open_count=open_count+1 WHERE id=${recipientId}`;
      if (recipient.outbound_message_id) await tx`UPDATE outbound_messages SET first_opened_at=COALESCE(first_opened_at,now()), updated_at=now() WHERE id=${recipient.outbound_message_id}`;
    }
    if (type === "click") {
      await tx`UPDATE campaign_recipients SET clicked_at=COALESCE(clicked_at,now()), click_count=click_count+1 WHERE id=${recipientId}`;
      if (recipient.outbound_message_id) await tx`UPDATE outbound_messages SET first_clicked_at=COALESCE(first_clicked_at,now()), updated_at=now() WHERE id=${recipient.outbound_message_id}`;
    }
    if (type === "delivery") {
      await tx`UPDATE campaign_recipients SET status='delivered', delivered_at=COALESCE(delivered_at,now()) WHERE id=${recipientId}`;
      if (recipient.outbound_message_id) await tx`UPDATE outbound_messages SET status='delivered', delivered_at=COALESCE(delivered_at,now()), updated_at=now() WHERE id=${recipient.outbound_message_id}`;
    }
    if (type === "bounce") {
      await tx`UPDATE campaign_recipients SET status='bounced' WHERE id=${recipientId}`;
      if (recipient.outbound_message_id) await tx`UPDATE outbound_messages SET status='bounced', updated_at=now() WHERE id=${recipient.outbound_message_id}`;
      await tx`UPDATE contacts SET status='bounced', updated_at=now() WHERE id=${recipient.contact_id}`;
      await tx`INSERT INTO suppressions (email, reason, source, scope) VALUES (${recipient.email}, 'bounce', 'ses', 'all') ON CONFLICT(lower(email),scope) DO UPDATE SET reason='bounce',source='ses',status='active',resolved_at=NULL,resolved_by=NULL,resolution_note='',updated_at=now() WHERE suppressions.reason NOT IN('privacy','merged')`;
    }
    if (type === "complaint") {
      await tx`UPDATE campaign_recipients SET status='complained' WHERE id=${recipientId}`;
      if (recipient.outbound_message_id) await tx`UPDATE outbound_messages SET status='complained', updated_at=now() WHERE id=${recipient.outbound_message_id}`;
      await tx`UPDATE contacts SET status='complained', updated_at=now() WHERE id=${recipient.contact_id}`;
      await tx`INSERT INTO suppressions (email, reason, source, scope) VALUES (${recipient.email}, 'complaint', 'ses', 'all') ON CONFLICT(lower(email),scope) DO UPDATE SET reason='complaint',source='ses',status='active',resolved_at=NULL,resolved_by=NULL,resolution_note='',updated_at=now() WHERE suppressions.reason NOT IN('privacy','merged')`;
    }
  });
  await recomputeCampaignStats(recipient.campaign_id);
  return true;
}

export async function recordMessageEvent(messageId: string, type: "opened" | "clicked", payload: unknown = {}, linkUrl?: string,isAutomated=false) {
  const [message] = await sql<{ id: string; ses_message_id: string | null;ses_tracking_source:string;mail_transport:"smtp"|"ses" }[]>`
    SELECT m.id,m.ses_message_id,s.ses_tracking_source,s.mail_transport FROM outbound_messages m CROSS JOIN settings s WHERE m.id=${messageId}
  `;
  if (!message||((env.mailTransport??message.mail_transport)==="ses"&&message.ses_tracking_source!=="local")) return false;
  const storedPayload = JSON.parse(JSON.stringify(payload)) as never;
  await sql.begin(async (tx) => {
    await tx`
      INSERT INTO email_events (event_key, message_id, type, ses_message_id, link_url, source, payload,is_automated)
      VALUES (${eventKey({ type, messageId, linkUrl, nonce: crypto.randomUUID() })}, ${messageId}, ${type}, ${message.ses_message_id}, ${linkUrl ?? null}, 'tracking', ${tx.json(storedPayload)},${isAutomated})
    `;
    if (type === "opened") await tx`
      UPDATE outbound_messages SET first_opened_at=COALESCE(first_opened_at,now()), updated_at=now() WHERE id=${messageId}
    `;
    if (type === "clicked") await tx`
      UPDATE outbound_messages SET first_clicked_at=COALESCE(first_clicked_at,now()), updated_at=now() WHERE id=${messageId}
    `;
  });
  return true;
}
