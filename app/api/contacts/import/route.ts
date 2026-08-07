import { NextResponse } from "next/server";
import { parse } from "csv-parse/sync";
import { sql } from "@/lib/db";
import { apiError, requireApiSession } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const unauthorized = await requireApiSession("contacts:write");
  if (unauthorized) return unauthorized;
  try {
    const data = await request.formData();
    const file = data.get("file");
    const listId = String(data.get("listId") ?? "");
    if (!(file instanceof File)) throw new Error("Selecciona un archivo CSV");
    const records = parse(await file.text(), {
      columns: (headers: string[]) => headers.map((header) => header.trim().toLowerCase()),
      skip_empty_lines: true,
      trim: true,
      bom: true,
    }) as Record<string, string>[];
    if (records.length > 20_000) throw new Error("El archivo supera el límite local de 20.000 filas");

    let created = 0;
    let updated = 0;
    let skipped = 0;
    for (const record of records) {
      const email = (record.email || record.correo || record["correo electrónico"] || "").toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(email)) { skipped += 1; continue; }
      const [existing] = await sql<{ id: string }[]>`SELECT id FROM contacts WHERE lower(email) = lower(${email})`;
      const [contact] = await sql<{ id: string }[]>`
        INSERT INTO contacts (email, first_name, last_name, phone, source, custom_fields)
        VALUES (${email}, ${record.first_name || record.nombre || ""}, ${record.last_name || record.apellidos || ""}, ${record.phone || record.telefono || ""}, 'csv', ${sql.json({ country: record.country || record.pais || "", city: record.city || record.ciudad || "" })})
        ON CONFLICT ((lower(email))) DO UPDATE SET
          first_name = COALESCE(NULLIF(EXCLUDED.first_name, ''), contacts.first_name),
          last_name = COALESCE(NULLIF(EXCLUDED.last_name, ''), contacts.last_name),
          phone = COALESCE(NULLIF(EXCLUDED.phone, ''), contacts.phone),
          custom_fields = contacts.custom_fields || EXCLUDED.custom_fields,
          updated_at = now()
        RETURNING id
      `;
      if (listId) {
        const [subscription] = await sql<{ id: string }[]>`
          INSERT INTO subscriptions (contact_id, list_id, status, source, subscribed_at, consent_text)
          VALUES (${contact.id}, ${listId}, 'active', 'csv', now(), 'Importación administrativa')
          ON CONFLICT (contact_id, list_id) DO NOTHING RETURNING id
        `;
        if (subscription) await sql`
          INSERT INTO consent_events (contact_id, subscription_id, list_id, action, source, consent_text)
          VALUES (${contact.id}, ${subscription.id}, ${listId}, 'subscribed', 'csv', 'Importación administrativa')
        `;
      }
      if (existing) updated += 1; else created += 1;
    }
    await sql`INSERT INTO audit_log (action, entity_type, detail) VALUES ('import', 'contact', ${sql.json({ created, updated, skipped })})`;
    return NextResponse.json({ created, updated, skipped });
  } catch (error) {
    return apiError(error);
  }
}
