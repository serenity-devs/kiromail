import { NextResponse } from "next/server";
import { z } from "zod";
import { apiKeyScopes } from "@/lib/api-key-scopes";
import { createApiKey } from "@/lib/api-auth";
import { getCurrentSession } from "@/lib/auth";
import { sql } from "@/lib/db";
import { apiError, requireApiSession } from "@/lib/http";

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  scopes: z.array(z.enum(apiKeyScopes)).min(1).transform((scopes) => [...new Set(scopes)]),
  expires_at: z.iso.datetime().nullable().optional().refine(
    (value) => !value || new Date(value).getTime() > Date.now(),
    "La caducidad debe estar en el futuro",
  ),
});

export async function GET() {
  const unauthorized = await requireApiSession("api_keys:manage"); if (unauthorized) return unauthorized;
  const keys = await sql`
    SELECT k.id, k.name, k.prefix, k.scopes, k.expires_at, k.last_used_at,
      k.revoked_at, k.created_at, u.name AS created_by_name
    FROM api_keys k LEFT JOIN users u ON u.id=k.created_by
    ORDER BY k.created_at DESC
  `;
  return NextResponse.json({ data: keys });
}

export async function POST(request: Request) {
  const unauthorized = await requireApiSession("api_keys:manage"); if (unauthorized) return unauthorized;
  try {
    const input = createSchema.parse(await request.json());
    const session = await getCurrentSession();
    if (!session) return NextResponse.json({ error: "Sesión caducada" }, { status: 401 });
    const key = await createApiKey({ name: input.name, scopes: input.scopes, expiresAt: input.expires_at ? new Date(input.expires_at) : null, createdBy: session.user.id });
    await sql`INSERT INTO audit_log (action, entity_type, entity_id, user_id, detail) VALUES ('create', 'api_key', ${key.id}, ${session.user.id}, ${sql.json({ name: key.name, scopes: key.scopes })})`;
    return NextResponse.json(key, { status: 201 });
  } catch (error) { return apiError(error); }
}

export async function DELETE(request: Request) {
  const unauthorized = await requireApiSession("api_keys:manage"); if (unauthorized) return unauthorized;
  try {
    const { id } = z.object({ id: z.string().uuid() }).parse(await request.json());
    const session = await getCurrentSession();
    if (!session) return NextResponse.json({ error: "Sesión caducada" }, { status: 401 });
    const [key] = await sql<{ id: string; name: string }[]>`UPDATE api_keys SET revoked_at=COALESCE(revoked_at,now()) WHERE id=${id} RETURNING id,name`;
    if (!key) return NextResponse.json({ error: "Clave API no encontrada" }, { status: 404 });
    await sql`INSERT INTO audit_log (action, entity_type, entity_id, user_id, detail) VALUES ('revoke', 'api_key', ${key.id}, ${session.user.id}, ${sql.json({ name: key.name })})`;
    return NextResponse.json({ ok: true, id: key.id });
  } catch (error) { return apiError(error); }
}
