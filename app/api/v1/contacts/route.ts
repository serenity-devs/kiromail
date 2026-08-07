import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateApiRequest } from "@/lib/api-auth";
import { assertEmailMayBeStored, ContactPrivacyError } from "@/lib/contact-privacy";
import { sql } from "@/lib/db";
import { suggestEmailCorrection } from "@/lib/email-quality";
import { versionedItems,versionedJson } from "@/lib/http-concurrency";

const schema=z.object({email:z.email(),first_name:z.string().trim().max(200).default(""),last_name:z.string().trim().max(200).default(""),phone:z.string().trim().max(80).default(""),language:z.string().max(12).default("es"),timezone:z.string().max(80).default(""),fields:z.record(z.string(),z.unknown()).default({}),source:z.string().trim().min(1).max(80).default("api")});

export async function GET(request:Request){
  const principal=await authenticateApiRequest(request,"contacts:read");if(!principal)return NextResponse.json({error:{code:"unauthorized",message:"No autorizado"}},{status:401});const url=new URL(request.url);const query=url.searchParams.get("q");const email=url.searchParams.get("email");const status=url.searchParams.get("status");const cursor=url.searchParams.get("cursor");const limit=Math.min(Math.max(Number(url.searchParams.get("limit")??50),1),200);
  const rows=await sql`
    SELECT c.id,c.revision,c.email,c.first_name,c.last_name,c.phone,c.status,c.source,c.custom_fields AS fields,c.language,c.timezone,c.created_at,c.updated_at,c.last_activity_at,
      (SELECT count(*)::int FROM subscriptions s WHERE s.contact_id=c.id AND s.status='active') AS active_subscriptions
    FROM contacts c WHERE c.merged_into_contact_id IS NULL AND c.anonymized_at IS NULL
      AND (${email}::text IS NULL OR lower(c.email)=lower(${email})) AND (${status}::text IS NULL OR c.status=${status})
      AND (${query}::text IS NULL OR c.email ILIKE '%'||${query}||'%' OR c.first_name ILIKE '%'||${query}||'%' OR c.last_name ILIKE '%'||${query}||'%')
      AND (${cursor}::uuid IS NULL OR c.created_at<(SELECT created_at FROM contacts WHERE id=${cursor}::uuid))
    ORDER BY c.created_at DESC,c.id DESC LIMIT ${limit+1}
  `;const hasMore=rows.length>limit;const data=rows.slice(0,limit);return NextResponse.json({data:versionedItems(data as {id:string;revision:number}[],"contact"),next_cursor:hasMore?data.at(-1)?.id:null});
}

export async function POST(request:Request){
  const principal=await authenticateApiRequest(request,"contacts:write");if(!principal)return NextResponse.json({error:{code:"unauthorized",message:"No autorizado"}},{status:401});
  try{const input=schema.parse(await request.json());const email=input.email.trim().toLowerCase();const suggestion=suggestEmailCorrection(email);const warnings=suggestion?[{code:"possible_email_typo",message:`¿Querías decir ${suggestion}?`,suggestion}]:[];await assertEmailMayBeStored(email);const fields=JSON.parse(JSON.stringify(input.fields)) as never;const [existing]=await sql<{id:string;status:string}[]>`SELECT id,status FROM contacts WHERE lower(email)=${email} AND merged_into_contact_id IS NULL AND anonymized_at IS NULL`;
    if(existing){const [contact]=await sql`UPDATE contacts SET first_name=CASE WHEN ${input.first_name}='' THEN first_name ELSE ${input.first_name} END,last_name=CASE WHEN ${input.last_name}='' THEN last_name ELSE ${input.last_name} END,phone=CASE WHEN ${input.phone}='' THEN phone ELSE ${input.phone} END,custom_fields=custom_fields||${sql.json(fields)},language=${input.language},timezone=CASE WHEN ${input.timezone}='' THEN timezone ELSE ${input.timezone} END,updated_at=now() WHERE id=${existing.id} RETURNING *`;return versionedJson(request,{...contact,created:false,warnings},"contact",contact.id,contact.revision);}
    const [contact]=await sql`INSERT INTO contacts(email,first_name,last_name,phone,status,source,custom_fields,language,timezone)VALUES(${email},${input.first_name},${input.last_name},${input.phone},'active',${input.source},${sql.json(fields)},${input.language},${input.timezone})RETURNING *`;return versionedJson(request,{...contact,created:true,warnings},"contact",contact.id,contact.revision,201);
  }catch(error){if(error instanceof z.ZodError)return NextResponse.json({error:{code:"validation_error",message:"Datos no válidos",issues:error.issues}},{status:422});if(error instanceof ContactPrivacyError)return NextResponse.json({error:{code:error.code,message:error.message}},{status:error.status});return NextResponse.json({error:{code:"contact_error",message:error instanceof Error?error.message:"No se pudo guardar"}},{status:422});}
}
