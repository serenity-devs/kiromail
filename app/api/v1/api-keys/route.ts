import { NextResponse } from "next/server";
import { z } from "zod";
import { createApiKey } from "@/lib/api-auth";
import { sql } from "@/lib/db";
import { apiError, requireApiSession } from "@/lib/http";

const allowedScopes = [
  "*", "lists:read", "lists:write", "contacts:read", "contacts:write",
  "templates:read", "templates:write", "campaigns:read", "campaigns:write", "campaigns:send", "campaigns:approve",
  "transactional:send", "transactional:read", "events:read", "reports:read",
  "webhooks:read", "webhooks:write",
] as const;

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  scopes: z.array(z.enum(allowedScopes)).min(1),
  expires_at: z.iso.datetime().nullable().optional(),
});

export async function GET() {
  const unauthorized = await requireApiSession("api_keys:manage"); if (unauthorized) return unauthorized;
  const keys = await sql`
    SELECT id, name, prefix, scopes, expires_at, last_used_at, revoked_at, created_at
    FROM api_keys ORDER BY created_at DESC
  `;
  return NextResponse.json({ data: keys });
}

export async function POST(request: Request) {
  const unauthorized = await requireApiSession("api_keys:manage"); if (unauthorized) return unauthorized;
  try {
    const input = createSchema.parse(await request.json());
    const key = await createApiKey({ name: input.name, scopes: input.scopes, expiresAt: input.expires_at ? new Date(input.expires_at) : null });
    await sql`INSERT INTO audit_log (action, entity_type, entity_id, detail) VALUES ('create', 'api_key', ${key.id}, ${sql.json({ name: key.name, scopes: key.scopes })})`;
    return NextResponse.json(key, { status: 201 });
  } catch (error) { return apiError(error); }
}

export async function DELETE(request: Request) {
  const unauthorized = await requireApiSession("api_keys:manage"); if (unauthorized) return unauthorized;
  try {
    const { id } = z.object({ id: z.string().uuid() }).parse(await request.json());
    await sql`UPDATE api_keys SET revoked_at=COALESCE(revoked_at,now()) WHERE id=${id}`;
    await sql`INSERT INTO audit_log (action, entity_type, entity_id) VALUES ('revoke', 'api_key', ${id})`;
    return NextResponse.json({ ok: true });
  } catch (error) { return apiError(error); }
}
