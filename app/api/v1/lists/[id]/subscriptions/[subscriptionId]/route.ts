import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateApiRequest } from "@/lib/api-auth";
import { sql } from "@/lib/db";
import { validateListValues } from "@/lib/list-fields";
import { preconditionResponse, requireIfMatch, staleResourceResponse, versionedJson } from "@/lib/http-concurrency";

const schema = z.object({ fields: z.record(z.string(),z.unknown()), consent_text:z.string().max(5000).optional() });

export async function GET(request:Request,context:{params:Promise<{id:string;subscriptionId:string}>}){const principal=await authenticateApiRequest(request,"contacts:read");if(!principal)return NextResponse.json({error:{code:"unauthorized",message:"No autorizado"}},{status:401});const{id,subscriptionId}=await context.params;const[subscription]=await sql`SELECT * FROM subscriptions WHERE id=${subscriptionId} AND list_id=${id}`;if(!subscription)return NextResponse.json({error:{code:"not_found",message:"Suscripción no encontrada"}},{status:404});return versionedJson(request,subscription,"subscription",`${id}/${subscriptionId}`,subscription.revision);}

export async function PATCH(request:Request,context:{params:Promise<{id:string;subscriptionId:string}>}) {
  const principal=await authenticateApiRequest(request,"contacts:write");
  if(!principal)return NextResponse.json({error:{code:"unauthorized",message:"No autorizado"}},{status:401});
  try {
    const {id,subscriptionId}=await context.params;const revision=requireIfMatch(request,"subscription",`${id}/${subscriptionId}`); const input=schema.parse(await request.json());
    const validation=await validateListValues(id,input.fields,false);
    if(!validation.valid)return NextResponse.json({error:{code:"invalid_fields",message:"Campos no válidos",fields:validation.errors}},{status:422});
    const stored=JSON.parse(JSON.stringify(input.fields)) as never;
    const [subscription]=await sql`
      UPDATE subscriptions SET custom_values=custom_values || ${sql.json(stored)},consent_text=COALESCE(${input.consent_text ?? null},consent_text),updated_at=now()
      WHERE id=${subscriptionId} AND list_id=${id} AND revision=${revision} AND status IN ('pending','active') RETURNING *
    `;
    if(!subscription)return staleResourceResponse();
    return versionedJson(request,subscription,"subscription",`${id}/${subscriptionId}`,subscription.revision);
  } catch(error){const precondition=preconditionResponse(error);if(precondition)return precondition;if(error instanceof z.ZodError)return NextResponse.json({error:{code:"validation_error",message:"Datos no válidos",issues:error.issues}},{status:422});throw error;}
}
