import { NextResponse } from "next/server";
import { z } from "zod";
import { clearSessionCookie, getCurrentSession } from "@/lib/auth";
import { sql } from "@/lib/db";

export async function GET() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Sesión caducada" }, { status: 401 });
  const rows = await sql`
    SELECT id,label,ip::text,user_agent,created_at,last_used_at,expires_at
    FROM user_sessions WHERE user_id=${session.user.id} AND revoked_at IS NULL AND expires_at>now()
    ORDER BY last_used_at DESC
  `;
  return NextResponse.json({ data: rows.map(row => ({ ...row, current: row.id === session.id })) });
}

export async function DELETE(request: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Sesión caducada" }, { status: 401 });
  try {
    const input = z.union([
      z.object({ id: z.string().uuid() }),
      z.object({ all_others: z.literal(true) }),
    ]).parse(await request.json());
    if ("all_others" in input) {
      const revoked = await sql`
        UPDATE user_sessions
        SET revoked_at=COALESCE(revoked_at,now())
        WHERE user_id=${session.user.id} AND id<>${session.id}
          AND revoked_at IS NULL AND expires_at>now()
        RETURNING id
      `;
      await sql`
        INSERT INTO audit_log(action,entity_type,entity_id,user_id,detail)
        VALUES('revoke_others','user_session',${session.id},${session.user.id},${sql.json({count:revoked.length})})
      `;
      return NextResponse.json({ revoked: true, revoked_count: revoked.length, current: false });
    }
    const { id } = input;
    const [revoked] = await sql`UPDATE user_sessions SET revoked_at=COALESCE(revoked_at,now()) WHERE id=${id} AND user_id=${session.user.id} RETURNING id`;
    if (!revoked) return NextResponse.json({ error: "Sesión no encontrada" }, { status: 404 });
    if (id === session.id) await clearSessionCookie();
    return NextResponse.json({ revoked: true, current: id === session.id });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Sesión no válida" }, { status: 422 });
    throw error;
  }
}
