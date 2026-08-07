import { NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/api-auth";
import { ContactPrivacyError, exportContactData } from "@/lib/contact-privacy";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const principal = await authenticateApiRequest(request, "contacts:read");
  if (!principal) return NextResponse.json({ error: { code: "unauthorized", message: "No autorizado" } }, { status: 401 });
  try {
    const { id } = await context.params;
    const payload = await exportContactData(id, {
      userId: principal.kind === "session" ? principal.id : null,
      apiKeyId: principal.kind === "api_key" ? principal.id : null,
    });
    return NextResponse.json(payload, {
      headers: {
        "Content-Disposition": `attachment; filename="contact-${id}.json"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    if (error instanceof ContactPrivacyError) return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.status });
    console.error(error);
    return NextResponse.json({ error: { code: "export_failed", message: "No se pudo exportar el contacto" } }, { status: 500 });
  }
}
