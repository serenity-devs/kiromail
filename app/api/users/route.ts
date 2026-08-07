import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth";
import { sql } from "@/lib/db";
import { hashPassword } from "@/lib/passwords";

const schema = z.object({
  email: z.email(), name: z.string().trim().min(1).max(200),
  role: z.enum(["admin", "editor", "analyst"]), password: z.string().min(12).max(512),
});

export async function GET() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Sesión caducada" }, { status: 401 });
  if (session.user.role !== "admin") return NextResponse.json({ error: "No tienes permiso para gestionar usuarios" }, { status: 403 });
  const users = await sql`
    SELECT u.id,u.email,u.name,u.role,u.status,u.mfa_enabled,u.last_login_at,u.created_at,u.updated_at,
      count(s.id) FILTER (WHERE s.revoked_at IS NULL AND s.expires_at>now())::int AS active_sessions
    FROM users u LEFT JOIN user_sessions s ON s.user_id=u.id
    GROUP BY u.id ORDER BY u.created_at
  `;
  return NextResponse.json({ data: users });
}

export async function POST(request: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Sesión caducada" }, { status: 401 });
  if (session.user.role !== "admin") return NextResponse.json({ error: "No tienes permiso para gestionar usuarios" }, { status: 403 });
  try {
    const input = schema.parse(await request.json());
    const passwordHash = await hashPassword(input.password);
    const [user] = await sql.begin(async tx => {
      const [created] = await tx`
        INSERT INTO users(email,name,password_hash,role,status,password_changed_at)
        VALUES(${input.email.trim().toLowerCase()},${input.name},${passwordHash},${input.role},'active',now())
        RETURNING id,email,name,role,status,mfa_enabled,last_login_at,created_at,updated_at
      `;
      await tx`INSERT INTO audit_log(action,entity_type,entity_id,user_id,detail) VALUES('create','user',${created.id},${session.user.id},${tx.json({email:created.email,role:created.role})})`;
      return [created];
    });
    return NextResponse.json(user, { status: 201 });
  } catch (error) {
    if ((error as { code?: string }).code === "23505") return NextResponse.json({ error: "Ya existe un usuario con ese correo" }, { status: 409 });
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Datos de usuario no válidos", issues: error.issues }, { status: 422 });
    console.error(error); return NextResponse.json({ error: "No se pudo crear el usuario" }, { status: 500 });
  }
}
