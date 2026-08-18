import { NextResponse } from "next/server";
import { readUnsubscribeToken } from "@/lib/auth";
import { sql } from "@/lib/db";
import { recomputeCampaignStats } from "@/lib/campaign-service";
import { eventKey } from "@/lib/email";
import { requestIp, unsubscribeWithPublicToken } from "@/lib/public-preferences";
import { publicAppUrl } from "@/lib/config";

async function unsubscribe(token: string) {
  const data = readUnsubscribeToken(token);
  if (!data) throw new Error("El enlace no es válido");
  await sql.begin(async (tx) => {
    const [context] = await tx<{ contact_id: string; list_id: string | null; subscription_id: string | null }[]>`
      SELECT c.id AS contact_id, ca.list_id, s.id AS subscription_id
      FROM contacts c
      JOIN campaigns ca ON ca.id=${data.campaignId}
      LEFT JOIN subscriptions s ON s.contact_id=c.id AND s.list_id=ca.list_id
      WHERE lower(c.email)=lower(${data.email})
    `;
    if (!context) throw new Error("No se encuentra la suscripción");
    if (context.subscription_id && context.list_id) {
      const [changed] = await tx<{ id: string }[]>`
        UPDATE subscriptions SET status='unsubscribed', unsubscribed_at=COALESCE(unsubscribed_at,now()), updated_at=now()
        WHERE id=${context.subscription_id} AND status <> 'unsubscribed' RETURNING id
      `;
      if (changed) await tx`
        INSERT INTO consent_events (contact_id, subscription_id, list_id, action, source, consent_text)
        VALUES (${context.contact_id}, ${context.subscription_id}, ${context.list_id}, 'unsubscribed', 'email_link', 'Baja desde campaña')
      `;
    } else {
      await tx`
        INSERT INTO suppressions (email, reason, source, scope, detail)
        VALUES (${data.email}, 'unsubscribe', 'legacy_campaign_without_list', 'marketing', ${tx.json({ campaignId: data.campaignId })})
        ON CONFLICT(lower(email),scope) DO UPDATE SET reason='unsubscribe',source=EXCLUDED.source,detail=EXCLUDED.detail,status='active',resolved_at=NULL,resolved_by=NULL,resolution_note='',updated_at=now()
      `;
    }
    const recipients = await tx<{ id: string; outbound_message_id: string | null; ses_message_id: string | null }[]>`
      UPDATE campaign_recipients SET status='unsubscribed'
      WHERE campaign_id=${data.campaignId} AND lower(email)=lower(${data.email})
      RETURNING id, outbound_message_id, ses_message_id
    `;
    for (const recipient of recipients) await tx`
      INSERT INTO email_events (event_key, message_id, recipient_id, campaign_id, contact_id, type, ses_message_id, source, payload)
      VALUES (${eventKey({ type: "unsubscribe", recipientId: recipient.id })}, ${recipient.outbound_message_id}, ${recipient.id}, ${data.campaignId}, ${context.contact_id}, 'unsubscribe', ${recipient.ses_message_id}, 'link', ${tx.json({ listId: context.list_id })})
      ON CONFLICT (event_key) DO NOTHING
    `;
    await tx`INSERT INTO audit_log (action, entity_type, entity_id, detail) VALUES ('unsubscribe', 'subscription', ${context.subscription_id ?? data.email}, ${tx.json({ campaignId: data.campaignId, listId: context.list_id })})`;
  });
  await recomputeCampaignStats(data.campaignId);
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  let token = url.searchParams.get("token") ?? "";
  if (!token) {
    const type = request.headers.get("content-type") ?? "";
    if (type.includes("application/json")) token = String((await request.json()).token ?? "");
    else token = String((await request.formData()).get("token") ?? "");
  }
  try {
    const modern=await unsubscribeWithPublicToken(token,requestIp(request),request.headers.get("user-agent")??"");
    if(modern?.campaignId)await recomputeCampaignStats(modern.campaignId);
    if(!modern)await unsubscribe(token);
    if ((request.headers.get("accept") ?? "").includes("text/html")) return NextResponse.redirect(publicAppUrl("/unsubscribe/done"), 303);
    return NextResponse.json({ unsubscribed: true });
  } catch {
    return NextResponse.json({ error: "Enlace de baja no válido" }, { status: 400 });
  }
}
