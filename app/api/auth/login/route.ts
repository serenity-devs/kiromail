import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateCredentials } from "@/lib/auth";

const schema = z.object({ email: z.email(), password: z.string().min(1).max(512), mfa_code: z.string().trim().max(32).optional() });

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    const result = await authenticateCredentials(request, body.email, body.password, body.mfa_code);
    if (!result.ok) return NextResponse.json({ error: result.message, code: result.code }, { status: result.code === "rate_limited" ? 429 : 401, headers: result.retryAfter ? { "Retry-After": String(result.retryAfter) } : undefined });
    return NextResponse.json({ ok: true, user: result.user });
  } catch {
    return NextResponse.json({ error: "Petición de acceso no válida" }, { status: 422 });
  }
}
