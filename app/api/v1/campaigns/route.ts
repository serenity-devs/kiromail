import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateApiRequest } from "@/lib/api-auth";
import { sql } from "@/lib/db";
import { headerText } from "@/lib/validation";
import { resourceEtag,versionedJson } from "@/lib/http-concurrency";

const schema = z.object({
  name:z.string().trim().min(1).max(200),list_id:z.string().uuid(),subject:headerText(1,998),preview_text:z.string().max(200).default(""),
  from:z.object({name:headerText(1,200),email:z.email()}).optional(),reply_to:z.union([z.email(),z.literal("")]).optional(),
  template_version_id:z.string().uuid().optional(),content:z.object({html:z.string().min(1).max(2_000_000),text:z.string().max(2_000_000).default("")}).optional(),
  segment_id:z.string().uuid().nullable().optional(),exclusion_segment_ids:z.array(z.string().uuid()).max(20).default([]),
  track_opens:z.boolean().optional(),track_clicks:z.boolean().optional(),approval_required:z.boolean().default(false),
}).refine((value)=>Boolean(value.template_version_id)!==Boolean(value.content),{message:"Indica exactamente template_version_id o content"});

async function campaignContent(input:z.infer<typeof schema>){
  if(input.content)return{source:"direct" as const,templateId:null,versionId:null,html:input.content.html,text:input.content.text};
  const [version]=await sql<{id:string;template_id:string;html_content:string;text_content:string;channel:string}[]>`
    SELECT v.id,v.template_id,v.html_content,v.text_content,t.channel FROM template_versions v JOIN templates t ON t.id=v.template_id
    WHERE v.id=${input.template_version_id ?? null} AND v.status='published' AND t.status='published'
  `;
  if(!version||version.channel!=="marketing")throw new Error("La versión de plantilla de marketing no existe o no está publicada");
  return{source:"template" as const,templateId:version.template_id,versionId:version.id,html:version.html_content,text:version.text_content};
}

export async function GET(request:Request){
  const principal=await authenticateApiRequest(request,"campaigns:read");if(!principal)return NextResponse.json({error:{code:"unauthorized",message:"No autorizado"}},{status:401});
  const url=new URL(request.url);const status=url.searchParams.get("status");const listId=url.searchParams.get("list_id");
  const rows=await sql`
    SELECT c.id,c.name,c.list_id,l.name AS list_name,c.subject,c.preview_text,c.from_name,c.from_email,c.reply_to,c.content_source,c.template_id,c.template_version_id,
      t.name AS template_name,v.version_number AS template_version_number,
      c.target_type,c.target_id,c.exclusion_segment_ids,c.status,c.scheduled_at,c.started_at,c.completed_at,c.total_recipients,c.sent_count,c.delivered_count,
      c.version,c.approval_required,c.approved_at,c.approved_version,
      (SELECT json_build_object('id',e.id,'status',e.status,'winner_metric',e.winner_metric,'sample_percentage',e.sample_percentage,'winner_variant_id',e.winner_variant_id,'actual_sample_size',e.actual_sample_size,'remainder_size',e.remainder_size) FROM campaign_experiments e WHERE e.campaign_id=c.id) AS experiment,
      c.open_count,c.click_count,c.bounce_count,c.complaint_count,c.unsubscribe_count,c.created_at,c.updated_at
    FROM campaigns c
    LEFT JOIN lists l ON l.id=c.list_id
    LEFT JOIN templates t ON t.id=c.template_id
    LEFT JOIN template_versions v ON v.id=c.template_version_id
    WHERE c.archived_at IS NULL AND (${status}::text IS NULL OR c.status=${status}) AND (${listId}::uuid IS NULL OR c.list_id=${listId}::uuid)
    ORDER BY c.created_at DESC LIMIT 200
  `;return NextResponse.json({data:rows.map(row=>({...row,etag:resourceEtag("campaign",row.id,row.version)}))});
}

export async function POST(request:Request){
  const principal=await authenticateApiRequest(request,"campaigns:write");if(!principal)return NextResponse.json({error:{code:"unauthorized",message:"No autorizado"}},{status:401});
  try{
    const input=schema.parse(await request.json());const [list]=await sql<{default_from_name:string;default_from_email:string;default_reply_to:string}[]>`
      SELECT default_from_name,default_from_email,default_reply_to FROM lists WHERE id=${input.list_id} AND status='active'
    `;if(!list)return NextResponse.json({error:{code:"list_not_found",message:"Lista no encontrada"}},{status:404});
    const [settings]=await sql<{default_from_name:string;default_from_email:string;default_reply_to:string}[]>`SELECT default_from_name,default_from_email,default_reply_to FROM settings WHERE id=1`;
    const content=await campaignContent(input);const fromName=input.from?.name||list.default_from_name||settings.default_from_name;const fromEmail=input.from?.email||list.default_from_email||settings.default_from_email;const replyTo=input.reply_to??(list.default_reply_to||settings.default_reply_to);
    const snapshot=JSON.parse(JSON.stringify({source:content.source,template_version_id:content.versionId,html:content.html,text:content.text,created_at:new Date().toISOString()})) as never;
    const [campaign]=await sql`
      INSERT INTO campaigns(name,list_id,subject,preview_text,from_name,from_email,reply_to,template_id,template_version_id,content_source,html_content,text_content,content_snapshot,
        target_type,target_id,exclusion_segment_ids,track_opens,track_clicks,approval_required,status)
      VALUES(${input.name},${input.list_id},${input.subject},${input.preview_text},${fromName},${fromEmail},${replyTo},${content.templateId},${content.versionId},${content.source},${content.html},${content.text},${sql.json(snapshot)},
        ${input.segment_id?"segment":"all"},${input.segment_id??null},${input.exclusion_segment_ids},${input.track_opens??null},${input.track_clicks??null},${input.approval_required},'draft') RETURNING *
    `;await sql`INSERT INTO audit_log(action,entity_type,entity_id,api_key_id,detail)VALUES('create','campaign',${campaign.id},${principal.kind==="api_key"?principal.id:null},${sql.json({list_id:input.list_id,content_source:content.source})})`;
    return versionedJson(request,campaign,"campaign",campaign.id,campaign.version,201);
  }catch(error){if(error instanceof z.ZodError)return NextResponse.json({error:{code:"validation_error",message:"Datos no válidos",issues:error.issues}},{status:422});return NextResponse.json({error:{code:"campaign_invalid",message:error instanceof Error?error.message:"No se pudo crear la campaña"}},{status:422});}
}

export { schema as campaignSchema, campaignContent };
