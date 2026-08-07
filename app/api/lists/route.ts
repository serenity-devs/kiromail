import { NextResponse } from "next/server";
import { z } from "zod";
import { sql } from "@/lib/db";
import { apiError, requireApiSession } from "@/lib/http";

export async function POST(request: Request) {
  const unauthorized = await requireApiSession("lists:write"); if (unauthorized) return unauthorized;
  try {
    const input = z.object({ key: z.string().trim().regex(/^[a-z][a-z0-9_]{1,63}$/).optional(), name: z.string().trim().min(1).max(120), description: z.string().max(300).default(""), color: z.string().regex(/^#[0-9a-f]{6}$/i).default("#315c5b") }).parse(await request.json());
    const generatedKey = input.key ?? `${input.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 48) || "lista"}_${crypto.randomUUID().slice(0, 8)}`;
    const [row] = await sql`INSERT INTO lists (key, name, description, color) VALUES (${generatedKey}, ${input.name}, ${input.description}, ${input.color}) RETURNING *`;
    return NextResponse.json(row, { status: 201 });
  } catch (error) { return apiError(error); }
}

export async function DELETE(request: Request) {
  const unauthorized = await requireApiSession("lists:write"); if (unauthorized) return unauthorized;
  try {
    const { id } = z.object({ id: z.string().uuid() }).parse(await request.json());
    await sql`UPDATE lists SET status='archived', archived_at=now(), updated_at=now() WHERE id = ${id}`;
    return NextResponse.json({ ok: true });
  } catch (error) { return apiError(error); }
}
