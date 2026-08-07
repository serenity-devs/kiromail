import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateApiRequest } from "@/lib/api-auth";
import { renderTemplateVersion, resolveTemplateVersion } from "@/lib/template-service";

const schema = z.object({
  template_key: z.string().trim().min(1).optional(), template_version_id: z.string().uuid().optional(),
  variables: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).default({}),
}).refine((value) => Boolean(value.template_key) !== Boolean(value.template_version_id), { message: "Indica exactamente una plantilla" });

export async function POST(request: Request) {
  const principal = await authenticateApiRequest(request, "templates:read");
  if (!principal) return NextResponse.json({ error: { code: "unauthorized", message: "No autorizado" } }, { status: 401 });
  try {
    const input = schema.parse(await request.json());
    const version = await resolveTemplateVersion({ templateKey: input.template_key, versionId: input.template_version_id });
    if (!version) return NextResponse.json({ error: { code: "not_found", message: "Plantilla no encontrada" } }, { status: 404 });
    return NextResponse.json({ template_version_id: version.id, ...renderTemplateVersion(version, input.variables) });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: { code: "validation_error", message: "Datos no válidos", issues: error.issues } }, { status: 422 });
    return NextResponse.json({ error: { code: "render_error", message: error instanceof Error ? error.message : "No se pudo renderizar" } }, { status: 422 });
  }
}
