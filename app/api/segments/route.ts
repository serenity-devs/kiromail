import { NextResponse } from "next/server";
import { z } from "zod";
import { sql } from "@/lib/db";
import { apiError, requireApiSession } from "@/lib/http";

const rule = z.object({
  field: z.enum(["status", "email", "country", "city", "list", "tag", "created_at"]),
  operator: z.enum(["is", "is_not", "contains", "before", "after"]),
  value: z.string().min(1),
});
const schema = z.object({ id: z.string().uuid().optional(), name: z.string().trim().min(1), description: z.string().max(300).default(""), match_type: z.enum(["all", "any"]).default("all"), rules: z.array(rule).min(1).max(12) });

export async function POST(request: Request) {
  const unauthorized = await requireApiSession("lists:write"); if (unauthorized) return unauthorized;
  try {
    const input = schema.parse(await request.json());
    const [row] = await sql`INSERT INTO segments (name, description, match_type, rules) VALUES (${input.name}, ${input.description}, ${input.match_type}, ${sql.json(input.rules)}) RETURNING *`;
    return NextResponse.json(row, { status: 201 });
  } catch (error) { return apiError(error); }
}

export async function PATCH(request: Request) {
  const unauthorized = await requireApiSession("lists:write"); if (unauthorized) return unauthorized;
  try {
    const input = schema.extend({ id: z.string().uuid() }).parse(await request.json());
    await sql`UPDATE segments SET name=${input.name}, description=${input.description}, match_type=${input.match_type}, rules=${sql.json(input.rules)}, updated_at=now() WHERE id=${input.id}`;
    return NextResponse.json({ ok: true });
  } catch (error) { return apiError(error); }
}

export async function DELETE(request: Request) {
  const unauthorized = await requireApiSession("lists:write"); if (unauthorized) return unauthorized;
  try {
    const { id } = z.object({ id: z.string().uuid() }).parse(await request.json());
    await sql`DELETE FROM segments WHERE id = ${id}`;
    return NextResponse.json({ ok: true });
  } catch (error) { return apiError(error); }
}
