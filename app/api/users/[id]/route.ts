import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth";
import { sql } from "@/lib/db";

const schema = z.object({ name: z.string().trim().min(1).max(200).optional(), role: z.enum(["admin", "editor", "analyst"]).optional(), status: z.enum(["active", "disabled"]).optional() }).refine(value => Object.keys(value).length > 0);

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Sesión caducada" }, { status: 401 });
  if (session.user.role !== "admin") return NextResponse.json({ error: "No tienes permiso para gestionar usuarios" }, { status: 403 });
  try {
    const { id } = await context.params;
    const input = schema.parse(await request.json());
    const [current] = await sql<{ role: string; status: string }[]>`SELECT role,status FROM users WHERE id=${id}`;
    if (!current) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    const removesAdmin = current.role === "admin" && current.status === "active" && (input.role && input.role !== "admin" || input.status === "disabled");
    if (removesAdmin) {
      const [{ admins }] = await sql<{ admins: number }[]>`SELECT count(*)::int AS admins FROM users WHERE role='admin' AND status='active'`;
      if (admins <= 1) return NextResponse.json({ error: "Debe quedar al menos un administrador activo" }, { status: 409 });
    }
    const [user] = await sql.begin(async tx => {
      const [updated] = await tx`
        UPDATE users SET name=COALESCE(${input.name ?? null},name),role=COALESCE(${input.role ?? null},role),status=COALESCE(${input.status ?? null},status),updated_at=now()
        WHERE id=${id} RETURNING id,email,name,role,status,mfa_enabled,last_login_at,created_at,updated_at
      `;
      if (input.status === "disabled" || input.role) await tx`UPDATE user_sessions SET revoked_at=COALESCE(revoked_at,now()) WHERE user_id=${id} AND revoked_at IS NULL`;
      await tx`INSERT INTO audit_log(action,entity_type,entity_id,user_id,detail) VALUES('update','user',${id},${session.user.id},${tx.json(input)})`;
      return [updated];
    });
    return NextResponse.json(user);
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Datos de usuario no válidos", issues: error.issues }, { status: 422 });
    console.error(error); return NextResponse.json({ error: "No se pudo actualizar el usuario" }, { status: 500 });
  }
}
