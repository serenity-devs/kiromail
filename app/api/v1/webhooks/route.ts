import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateApiRequest } from "@/lib/api-auth";
import { sql } from "@/lib/db";
import { encryptSecret } from "@/lib/secrets";
import { validateWebhookUrl } from "@/lib/webhooks";
import { versionedItems,versionedJson } from "@/lib/http-concurrency";

const schema=z.object({name:z.string().trim().min(1).max(120),url:z.url(),secret:z.string().min(16).max(500).optional(),events:z.array(z.string().min(1).max(80)).max(50).default([]),filters:z.record(z.string(),z.unknown()).default({})});
export async function GET(request:Request){const principal=await authenticateApiRequest(request,"webhooks:read");if(!principal)return NextResponse.json({error:{code:"unauthorized",message:"No autorizado"}},{status:401});const data=await sql`SELECT id,revision,name,url,events,filters,status,failure_count,last_success_at,last_failure_at,created_at,updated_at FROM webhook_endpoints ORDER BY created_at DESC`;return NextResponse.json({data:versionedItems(data as unknown as {id:string;revision:number}[],"webhook")});}
export async function POST(request:Request){const principal=await authenticateApiRequest(request,"webhooks:write");if(!principal)return NextResponse.json({error:{code:"unauthorized",message:"No autorizado"}},{status:401});try{const input=schema.parse(await request.json());await validateWebhookUrl(input.url);const secret=input.secret??randomBytes(32).toString("base64url");const filters=JSON.parse(JSON.stringify(input.filters)) as never;const[row]=await sql`INSERT INTO webhook_endpoints(name,url,secret_encrypted,events,filters)VALUES(${input.name},${input.url},${encryptSecret(secret)},${input.events},${sql.json(filters)})RETURNING id,revision,name,url,events,filters,status,created_at`;return versionedJson(request,{...row,secret},"webhook",row.id,row.revision,201);}catch(error){if(error instanceof z.ZodError)return NextResponse.json({error:{code:"validation_error",message:"Datos no válidos",issues:error.issues}},{status:422});return NextResponse.json({error:{code:"webhook_invalid",message:error instanceof Error?error.message:"Webhook no válido"}},{status:422});}}
