import { NextResponse } from "next/server";
import { z } from "zod";
import { sql } from "@/lib/db";
import { apiError, requireApiSession } from "@/lib/http";

export async function POST(request: Request) {
  const unauthorized = await requireApiSession("contacts:write"); if (unauthorized) return unauthorized;
  try {
    const input = z.object({ name: z.string().trim().min(1).max(80), color: z.string().regex(/^#[0-9a-f]{6}$/i).default("#c96d4b") }).parse(await request.json());
    const [row] = await sql`INSERT INTO tags (name, color) VALUES (${input.name}, ${input.color}) RETURNING *`;
    return NextResponse.json(row, { status: 201 });
  } catch (error) { return apiError(error); }
}

export async function DELETE(request: Request) {
  const unauthorized = await requireApiSession("contacts:write"); if (unauthorized) return unauthorized;
  try {
    const { id } = z.object({ id: z.string().uuid() }).parse(await request.json());
    await sql`DELETE FROM tags WHERE id = ${id}`;
    return NextResponse.json({ ok: true });
  } catch (error) { return apiError(error); }
}
