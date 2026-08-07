import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateApiRequest } from "@/lib/api-auth";
import { assertEmailMayBeStored, ContactPrivacyError } from "@/lib/contact-privacy";
import { sql } from "@/lib/db";
import { validateListValues } from "@/lib/list-fields";
import { resourceEtag, versionedJson } from "@/lib/http-concurrency";

const schema = z.object({
  email: z.email(), first_name: z.string().trim().max(200).default(""), last_name: z.string().trim().max(200).default(""),
  phone: z.string().trim().max(80).default(""), language: z.string().max(12).default("es"), timezone: z.string().max(80).default(""),
  contact_fields: z.record(z.string(), z.unknown()).default({}), fields: z.record(z.string(), z.unknown()).default({}),
  status: z.enum(["pending", "active"]).default("active"), source: z.string().trim().min(1).max(80).default("api"),
  consent_text: z.string().max(5000).default(""), legal_basis: z.string().max(200).default("consent"),
});

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const principal = await authenticateApiRequest(request, "contacts:read");
  if (!principal) return NextResponse.json({ error: { code: "unauthorized", message: "No autorizado" } }, { status: 401 });
  const { id } = await context.params; const url = new URL(request.url);
  const status = url.searchParams.get("status"); const cursor = url.searchParams.get("cursor");
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 50),1),200);
  const rows = await sql`
    SELECT s.id,s.revision,s.status,s.source,s.custom_values AS fields,s.subscribed_at,s.confirmed_at,s.unsubscribed_at,s.reactivated_at,s.created_at,s.updated_at,
      c.id AS contact_id,c.email,c.first_name,c.last_name,c.phone,c.language,c.timezone,c.custom_fields AS contact_fields,c.status AS contact_status
    FROM subscriptions s JOIN contacts c ON c.id=s.contact_id
    WHERE s.list_id=${id} AND c.merged_into_contact_id IS NULL AND c.anonymized_at IS NULL AND (${status}::text IS NULL OR s.status=${status})
      AND (${cursor}::uuid IS NULL OR s.created_at < (SELECT created_at FROM subscriptions WHERE id=${cursor}::uuid))
    ORDER BY s.created_at DESC,s.id DESC LIMIT ${limit + 1}
  `;
  const hasMore = rows.length > limit; const data = rows.slice(0,limit);
  return NextResponse.json({ data:data.map(row=>({...row,etag:resourceEtag("subscription",`${id}/${row.id}`,row.revision)})), next_cursor: hasMore ? data.at(-1)?.id : null });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const principal = await authenticateApiRequest(request, "contacts:write");
  if (!principal) return NextResponse.json({ error: { code: "unauthorized", message: "No autorizado" } }, { status: 401 });
  try {
    const { id } = await context.params; const input = schema.parse(await request.json());
    const [list] = await sql<{ id:string }[]>`SELECT id FROM lists WHERE id=${id} AND status='active'`;
    if (!list) return NextResponse.json({ error: { code: "not_found", message: "Lista no encontrada" } }, { status: 404 });
    const validation = await validateListValues(id,input.fields,input.status === "active");
    if (!validation.valid) return NextResponse.json({ error: { code: "invalid_fields", message: "Los campos de la lista no son válidos", fields: validation.errors } }, { status: 422 });
    const email = input.email.trim().toLowerCase();
    await assertEmailMayBeStored(email);
    const storedFields = JSON.parse(JSON.stringify(input.fields)) as never;
    const storedContactFields = JSON.parse(JSON.stringify(input.contact_fields)) as never;
    const result = await sql.begin(async (tx) => {
      let [contact] = await tx<{ id:string; status:string }[]>`SELECT id,status FROM contacts WHERE lower(email)=${email} AND merged_into_contact_id IS NULL AND anonymized_at IS NULL FOR UPDATE`;
      if (!contact) [contact] = await tx<{ id:string; status:string }[]>`
        INSERT INTO contacts (email,first_name,last_name,phone,status,source,custom_fields,language,timezone)
        VALUES (${email},${input.first_name},${input.last_name},${input.phone},'active',${input.source},${tx.json(storedContactFields)},${input.language},${input.timezone}) RETURNING id,status
      `;
      else await tx`
        UPDATE contacts SET first_name=CASE WHEN ${input.first_name}='' THEN first_name ELSE ${input.first_name} END,
          last_name=CASE WHEN ${input.last_name}='' THEN last_name ELSE ${input.last_name} END,
          phone=CASE WHEN ${input.phone}='' THEN phone ELSE ${input.phone} END,
          custom_fields=custom_fields || ${tx.json(storedContactFields)},language=${input.language},timezone=CASE WHEN ${input.timezone}='' THEN timezone ELSE ${input.timezone} END,updated_at=now()
        WHERE id=${contact.id}
      `;
      const [existing] = await tx<{ id:string; status:string }[]>`SELECT id,status FROM subscriptions WHERE contact_id=${contact.id} AND list_id=${id} FOR UPDATE`;
      if (existing?.status === "unsubscribed" || existing?.status === "archived") return { blocked: true as const, subscription: existing, contact_id: contact.id };
      let subscription;
      if (existing) {
        [subscription] = await tx`
          UPDATE subscriptions SET custom_values=${tx.json(storedFields)},source=${input.source},consent_text=${input.consent_text},updated_at=now()
          WHERE id=${existing.id} RETURNING *
        `;
        await tx`INSERT INTO consent_events (contact_id,subscription_id,list_id,action,source,consent_text,legal_basis,api_key_id,detail)
          VALUES (${contact.id},${existing.id},${id},'consent_updated',${input.source},${input.consent_text},${input.legal_basis},${principal.kind === "api_key" ? principal.id : null},${tx.json({ fields_updated: true })})`;
      } else {
        [subscription] = await tx`
          INSERT INTO subscriptions (contact_id,list_id,status,source,custom_values,subscribed_at,confirmed_at,consent_text,consent_user_agent)
          VALUES (${contact.id},${id},${input.status},${input.source},${tx.json(storedFields)},now(),${input.status === "active" ? new Date() : null},${input.consent_text},${request.headers.get("user-agent") ?? ""}) RETURNING *
        `;
        await tx`INSERT INTO consent_events (contact_id,subscription_id,list_id,action,source,consent_text,legal_basis,api_key_id)
          VALUES (${contact.id},${subscription.id},${id},${input.status === "active" ? "subscribed" : "consent_updated"},${input.source},${input.consent_text},${input.legal_basis},${principal.kind === "api_key" ? principal.id : null})`;
      }
      return { blocked: false as const, subscription, contact_id: contact.id };
    });
    if (result.blocked) return NextResponse.json({ error: { code: "explicit_reactivation_required", message: "La suscripción está dada de baja o archivada; usa la acción reactivate" }, subscription_id: result.subscription.id }, { status: 409 });
    return versionedJson(request,{ ...result.subscription, contact_id: result.contact_id },"subscription",`${id}/${result.subscription.id}`,result.subscription.revision,201);
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: { code: "validation_error", message: "Datos no válidos", issues:error.issues } }, { status:422 });
    if (error instanceof ContactPrivacyError) return NextResponse.json({error:{code:error.code,message:error.message}},{status:error.status});
    console.error(error); return NextResponse.json({ error: { code:"internal_error",message:"No se pudo crear la suscripción" } },{status:500});
  }
}
