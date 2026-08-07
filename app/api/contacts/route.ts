import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateApiRequest } from "@/lib/api-auth";
import { anonymizeContact, assertEmailMayBeStored } from "@/lib/contact-privacy";
import { sql } from "@/lib/db";
import { suggestEmailCorrection } from "@/lib/email-quality";
import { apiError, requireApiSession } from "@/lib/http";

const contactSchema = z.object({
  id: z.string().uuid().optional(),
  email: z.email(),
  first_name: z.string().trim().max(120).default(""),
  last_name: z.string().trim().max(120).default(""),
  phone: z.string().trim().max(80).default(""),
  status: z.enum(["active", "subscribed", "unsubscribed", "bounced", "complained", "blocked"]).default("active"),
  country: z.string().trim().max(120).default(""),
  city: z.string().trim().max(120).default(""),
  listIds: z.array(z.string().uuid()).default([]),
  tagIds: z.array(z.string().uuid()).default([]),
});

function globalStatus(status: z.infer<typeof contactSchema>["status"]) {
  return status === "subscribed" || status === "unsubscribed" ? "active" : status;
}

export async function POST(request: Request) {
  const unauthorized = await requireApiSession("contacts:write");
  if (unauthorized) return unauthorized;
  try {
    const input = contactSchema.parse(await request.json());
    await assertEmailMayBeStored(input.email);
    let contactId = "";
    await sql.begin(async (tx) => {
      const [contact] = await tx<{ id: string }[]>`
        INSERT INTO contacts (email, first_name, last_name, phone, status, custom_fields, source)
        VALUES (${input.email.toLowerCase()}, ${input.first_name}, ${input.last_name}, ${input.phone}, ${globalStatus(input.status)}, ${tx.json({ country: input.country, city: input.city })}, 'manual')
        RETURNING id
      `;
      contactId = contact.id;
      await tx`DELETE FROM contact_tags WHERE contact_id = ${contactId}`;
      for (const listId of input.listIds) {
        const [subscription] = await tx<{ id: string }[]>`
          INSERT INTO subscriptions (contact_id, list_id, status, source, subscribed_at, consent_text)
          VALUES (${contactId}, ${listId}, ${input.status === "unsubscribed" ? "unsubscribed" : "active"}, 'manual', now(), 'Alta administrativa')
          ON CONFLICT (contact_id, list_id) DO NOTHING RETURNING id
        `;
        if (subscription) await tx`
          INSERT INTO consent_events (contact_id, subscription_id, list_id, action, source, consent_text)
          VALUES (${contactId}, ${subscription.id}, ${listId}, ${input.status === "unsubscribed" ? "unsubscribed" : "subscribed"}, 'manual', 'Alta administrativa')
        `;
      }
      for (const tagId of input.tagIds) await tx`INSERT INTO contact_tags (contact_id, tag_id) VALUES (${contactId}, ${tagId}) ON CONFLICT DO NOTHING`;
      await tx`INSERT INTO audit_log (action, entity_type, entity_id, detail) VALUES ('create', 'contact', ${contactId}, ${tx.json({ email: input.email })})`;
    });
    const suggestion = suggestEmailCorrection(input.email);
    return NextResponse.json({ id: contactId, warnings: suggestion ? [{ code: "possible_email_typo", message: `¿Querías decir ${suggestion}?`, suggestion }] : [] }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request) {
  const unauthorized = await requireApiSession("contacts:write");
  if (unauthorized) return unauthorized;
  try {
    const input = contactSchema.extend({ id: z.string().uuid() }).parse(await request.json());
    await assertEmailMayBeStored(input.email);
    await sql.begin(async (tx) => {
      await tx`
        UPDATE contacts SET email = ${input.email.toLowerCase()}, first_name = ${input.first_name}, last_name = ${input.last_name},
          phone = ${input.phone}, status = ${globalStatus(input.status)},
          custom_fields = custom_fields || ${tx.json({ country: input.country, city: input.city })}, updated_at = now()
        WHERE id = ${input.id} AND merged_into_contact_id IS NULL AND anonymized_at IS NULL
      `;
      await tx`DELETE FROM contact_tags WHERE contact_id = ${input.id}`;
      const selected = input.listIds;
      const removed = await tx<{ id: string; list_id: string }[]>`
        UPDATE subscriptions SET status='unsubscribed', unsubscribed_at=COALESCE(unsubscribed_at, now()), updated_at=now()
        WHERE contact_id=${input.id} AND status='active'
          AND NOT (list_id = ANY(${selected}::uuid[]))
        RETURNING id, list_id
      `;
      for (const subscription of removed) await tx`
        INSERT INTO consent_events (contact_id, subscription_id, list_id, action, source, consent_text)
        VALUES (${input.id}, ${subscription.id}, ${subscription.list_id}, 'unsubscribed', 'admin', 'Cambio administrativo')
      `;
      for (const listId of selected) {
        const [subscription] = await tx<{ id: string }[]>`
          INSERT INTO subscriptions (contact_id, list_id, status, source, subscribed_at, consent_text)
          VALUES (${input.id}, ${listId}, 'active', 'manual', now(), 'Alta administrativa')
          ON CONFLICT (contact_id, list_id) DO NOTHING RETURNING id
        `;
        if (subscription) await tx`
          INSERT INTO consent_events (contact_id, subscription_id, list_id, action, source, consent_text)
          VALUES (${input.id}, ${subscription.id}, ${listId}, 'subscribed', 'manual', 'Alta administrativa')
        `;
      }
      for (const tagId of input.tagIds) await tx`INSERT INTO contact_tags (contact_id, tag_id) VALUES (${input.id}, ${tagId}) ON CONFLICT DO NOTHING`;
      await tx`INSERT INTO audit_log (action, entity_type, entity_id) VALUES ('update', 'contact', ${input.id})`;
    });
    const suggestion = suggestEmailCorrection(input.email);
    return NextResponse.json({ ok: true, warnings: suggestion ? [{ code: "possible_email_typo", message: `¿Querías decir ${suggestion}?`, suggestion }] : [] });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request) {
  const principal = await authenticateApiRequest(request,"contacts:write");
  if (!principal) return NextResponse.json({error:"No tienes permiso para esta operación"},{status:403});
  try {
    const { id, reason } = z.object({ id: z.string().uuid(), reason: z.string().trim().min(1).max(500).default("Solicitud de privacidad desde el panel") }).parse(await request.json());
    const result=await anonymizeContact(id,reason,{userId:principal.kind==="session"?principal.id:null,apiKeyId:principal.kind==="api_key"?principal.id:null});
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return apiError(error);
  }
}
