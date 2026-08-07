import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateApiRequest } from "@/lib/api-auth";
import { sql } from "@/lib/db";
import { versionedItems,versionedJson } from "@/lib/http-concurrency";

class ProtectedSuppressionError extends Error {}

const createSchema = z.object({
  email: z.email().transform(value => value.trim().toLowerCase()),
  reason: z.enum(["unsubscribe", "bounce", "complaint", "manual"]).default("manual"),
  scope: z.enum(["marketing", "transactional", "all"]).default("all"),
  note: z.string().max(1000).default(""),
});

const querySchema = z.object({
  q: z.string().max(320).default(""),
  reason: z.enum(["all", "unsubscribe", "bounce", "complaint", "manual", "privacy", "merged"]).default("all"),
  scope: z.enum(["any", "marketing", "transactional", "all"]).default("any"),
  status: z.enum(["any", "active", "resolved"]).default("active"),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

export async function GET(request: Request) {
  const principal = await authenticateApiRequest(request, "contacts:read");
  if (!principal) return NextResponse.json({ error: { code: "unauthorized", message: "No autorizado" } }, { status: 401 });
  try {
    const url = new URL(request.url);
    const input = querySchema.parse(Object.fromEntries(url.searchParams));
    const search = `%${input.q}%`;
    const data = await sql`
      SELECT s.id,s.revision,s.email,s.reason,s.source,s.scope,s.status,s.detail,s.resolution_note,
        s.created_at,s.updated_at,s.resolved_at,u.name AS resolved_by_name
      FROM suppressions s LEFT JOIN users u ON u.id=s.resolved_by
      WHERE (${input.q}='' OR s.email ILIKE ${search})
        AND (${input.reason}='all' OR s.reason=${input.reason})
        AND (${input.scope}='any' OR s.scope=${input.scope})
        AND (${input.status}='any' OR s.status=${input.status})
      ORDER BY CASE WHEN s.status='active' THEN 0 ELSE 1 END,s.updated_at DESC
      LIMIT ${input.limit}
    `;
    const [counts] = await sql`
      SELECT count(*) FILTER (WHERE status='active')::int AS active,
        count(*) FILTER (WHERE status='resolved')::int AS resolved,
        count(*) FILTER (WHERE status='active' AND scope IN ('marketing','all'))::int AS marketing,
        count(*) FILTER (WHERE status='active' AND scope IN ('transactional','all'))::int AS transactional
      FROM suppressions
    `;
    return NextResponse.json({ data:versionedItems(data as unknown as {id:string;revision:number}[],"suppression"), counts });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: { code: "validation_error", message: "Filtros no válidos", issues: error.issues } }, { status: 422 });
    console.error(error);
    return NextResponse.json({ error: { code: "internal_error", message: "No se pudieron cargar las supresiones" } }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const principal = await authenticateApiRequest(request, "contacts:write");
  if (!principal) return NextResponse.json({ error: { code: "unauthorized", message: "No autorizado" } }, { status: 401 });
  try {
    const input = createSchema.parse(await request.json());
    const userId = principal.kind === "session" ? principal.id : null;
    const apiKeyId = principal.kind === "api_key" ? principal.id : null;
    const suppression = await sql.begin(async tx => {
      const [existing] = await tx<{reason:string}[]>`SELECT reason FROM suppressions WHERE lower(email)=lower(${input.email}) AND scope=${input.scope} FOR UPDATE`;
      if (existing && ["privacy","merged"].includes(existing.reason)) throw new ProtectedSuppressionError("Una supresión de privacidad o fusión no se puede sustituir ni resolver");
      const [saved] = await tx`
        INSERT INTO suppressions(email,reason,source,scope,detail)
        VALUES(${input.email},${input.reason},'manual',${input.scope},${tx.json({ note: input.note })})
        ON CONFLICT(lower(email),scope) DO UPDATE SET
          reason=EXCLUDED.reason,source='manual',detail=EXCLUDED.detail,status='active',
          resolved_at=NULL,resolved_by=NULL,resolution_note='',updated_at=now()
        RETURNING *
      `;
      if (input.scope === "all") {
        const contactStatus = input.reason === "bounce" ? "bounced" : input.reason === "complaint" ? "complained" : "blocked";
        await tx`UPDATE contacts SET status=${contactStatus},updated_at=now() WHERE lower(email)=lower(${input.email})`;
      }
      await tx`INSERT INTO audit_log(action,entity_type,entity_id,user_id,api_key_id,detail) VALUES('create','suppression',${saved.id},${userId},${apiKeyId},${tx.json({ email: input.email, reason: input.reason, scope: input.scope, note: input.note })})`;
      return saved;
    });
    return versionedJson(request,suppression,"suppression",suppression.id,suppression.revision,201);
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: { code: "validation_error", message: "Datos no válidos", issues: error.issues } }, { status: 422 });
    if (error instanceof ProtectedSuppressionError) return NextResponse.json({error:{code:"protected_suppression",message:error.message}},{status:409});
    console.error(error);
    return NextResponse.json({ error: { code: "internal_error", message: "No se pudo crear la supresión" } }, { status: 500 });
  }
}
