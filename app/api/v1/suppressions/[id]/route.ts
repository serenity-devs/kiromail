import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateApiRequest } from "@/lib/api-auth";
import { sql } from "@/lib/db";
import { preconditionResponse,requireIfMatch,staleResourceResponse,versionedJson } from "@/lib/http-concurrency";

const schema = z.object({
  action: z.enum(["resolve", "reactivate"]),
  note: z.string().max(1000).default(""),
});

export async function GET(request:Request,context:{params:Promise<{id:string}>}){const principal=await authenticateApiRequest(request,"contacts:read");if(!principal)return NextResponse.json({error:{code:"unauthorized",message:"No autorizado"}},{status:401});const{id}=await context.params;const[row]=await sql`SELECT * FROM suppressions WHERE id=${id}`;if(!row)return NextResponse.json({error:{code:"not_found",message:"Supresión no encontrada"}},{status:404});return versionedJson(request,row,"suppression",id,row.revision);}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const principal = await authenticateApiRequest(request, "contacts:write");
  if (!principal) return NextResponse.json({ error: { code: "unauthorized", message: "No autorizado" } }, { status: 401 });
  try {
    const { id } = await context.params;
    const revision=requireIfMatch(request,"suppression",id);const input = schema.parse(await request.json());
    const userId = principal.kind === "session" ? principal.id : null;
    const apiKeyId = principal.kind === "api_key" ? principal.id : null;
    const result = await sql.begin(async tx => {
      const [current] = await tx<{ id: string; email: string; reason: string; scope: string; status: string;revision:number }[]>`SELECT id,email,reason,scope,status,revision FROM suppressions WHERE id=${id} FOR UPDATE`;
      if (!current) return null;
      if(Number(current.revision)!==revision)return "stale" as const;
      if (["privacy","merged"].includes(current.reason)) return "protected" as const;
      const [saved] = input.action === "resolve"
        ? await tx`
            UPDATE suppressions SET status='resolved',resolved_at=now(),resolved_by=${userId},
              resolution_note=${input.note},updated_at=now() WHERE id=${id} RETURNING *
          `
        : await tx`
            UPDATE suppressions SET status='active',resolved_at=NULL,resolved_by=NULL,
              resolution_note='',updated_at=now() WHERE id=${id} RETURNING *
          `;
      if (current.scope === "all") {
        if (input.action === "reactivate") {
          const contactStatus = current.reason === "bounce" ? "bounced" : current.reason === "complaint" ? "complained" : "blocked";
          await tx`UPDATE contacts SET status=${contactStatus},updated_at=now() WHERE lower(email)=lower(${current.email})`;
        } else {
          const [remaining] = await tx<{ count: number }[]>`
            SELECT count(*)::int AS count FROM suppressions
            WHERE lower(email)=lower(${current.email}) AND scope='all' AND status='active' AND id<>${id}
          `;
          if (remaining.count === 0) await tx`UPDATE contacts SET status='active',updated_at=now() WHERE lower(email)=lower(${current.email}) AND status IN ('blocked','bounced','complained')`;
        }
      }
      await tx`INSERT INTO audit_log(action,entity_type,entity_id,user_id,api_key_id,detail) VALUES(${input.action},'suppression',${id},${userId},${apiKeyId},${tx.json({ email: current.email, note: input.note, previous_status: current.status })})`;
      return saved;
    });
    if (!result) return NextResponse.json({ error: { code: "not_found", message: "Supresión no encontrada" } }, { status: 404 });
    if(result==="stale")return staleResourceResponse();
    if (result === "protected") return NextResponse.json({error:{code:"protected_suppression",message:"Las supresiones de privacidad y fusión son permanentes"}},{status:409});
    return versionedJson(request,result,"suppression",id,result.revision);
  } catch (error) {
    const precondition=preconditionResponse(error);if(precondition)return precondition;
    if (error instanceof z.ZodError) return NextResponse.json({ error: { code: "validation_error", message: "Datos no válidos", issues: error.issues } }, { status: 422 });
    console.error(error);
    return NextResponse.json({ error: { code: "internal_error", message: "No se pudo actualizar la supresión" } }, { status: 500 });
  }
}
