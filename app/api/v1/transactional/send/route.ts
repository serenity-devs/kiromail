import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateApiRequest } from "@/lib/api-auth";
import { acceptTransactionalMessage, TransactionalError } from "@/lib/transactional-service";
import { transactionalInputSchema } from "@/lib/transactional-schema";

export async function POST(request: Request) {
  const principal = await authenticateApiRequest(request, "transactional:send");
  if (!principal) return NextResponse.json({ error: { code: "unauthorized", message: "Clave API ausente, inválida o sin scope transactional:send" } }, { status: 401 });
  try {
    const input = transactionalInputSchema.parse(await request.json());
    const idempotencyKey = request.headers.get("idempotency-key") ?? "";
    const result = await acceptTransactionalMessage(input, idempotencyKey, { id: principal.id, kind: principal.kind });
    return NextResponse.json({
      id: result.message.id,
      status: result.message.status,
      duplicate: result.duplicate,
      created_at: result.message.created_at,
      mime_byte_size: result.message.mime_byte_size,
      mime_limit_bytes: Number(process.env.TRANSACTIONAL_MIME_MAX_BYTES ?? 40_000_000),
      status_url: `/api/v1/transactional/messages/${result.message.id}`,
    }, { status: 202 });
  } catch (error) {
    if (error instanceof TransactionalError) return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.status });
    if (error instanceof z.ZodError) return NextResponse.json({ error: { code: "validation_error", message: "Petición no válida", issues: error.issues } }, { status: 422 });
    console.error(error);
    return NextResponse.json({ error: { code: "internal_error", message: "No se pudo aceptar el mensaje" } }, { status: 500 });
  }
}
