import { NextResponse } from "next/server";
import { z } from "zod";
import { resetPassword } from "@/lib/auth";

const schema = z.object({ token: z.string().min(20).max(500), password: z.string().min(12).max(512) });

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    if (!(await resetPassword(input.token, input.password))) return NextResponse.json({ error: "El enlace no es válido o ha caducado" }, { status: 410 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "La contraseña debe tener al menos 12 caracteres" }, { status: 422 });
    console.error(error); return NextResponse.json({ error: "No se pudo cambiar la contraseña" }, { status: 500 });
  }
}
