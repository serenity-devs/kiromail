import { NextResponse } from "next/server";
import { z } from "zod";
import { sql } from "@/lib/db";
import { apiError, requireApiSession } from "@/lib/http";
import { recoverQueuedRecipients } from "@/lib/campaign-service";
import { recoverQueuedTransactionalMessages } from "@/lib/transactional-service";
import { getCurrentSession } from "@/lib/auth";
import { env } from "@/lib/config";
import { uiThemeIds } from "@/lib/ui-themes";

const schema = z.object({
  organization_name: z.string().trim().min(1), ui_theme: z.enum(uiThemeIds).default("kiro"), default_from_name: z.string().trim().min(1), default_from_email: z.email(), default_reply_to: z.email(),
  aws_region: z.string().trim().min(1), ses_configuration_set: z.string().trim(), ses_marketing_configuration_set: z.string().trim().default(""), ses_transactional_configuration_set: z.string().trim().default(""), mail_transport: z.enum(["smtp", "ses"]), sending_rate: z.coerce.number().int().min(1).max(1000),
  campaign_sending_rate: z.coerce.number().int().min(1).max(1000).default(10), transactional_reserved_rate: z.coerce.number().int().min(1).max(1000).default(2),
  physical_address: z.string().trim().min(1), track_opens: z.boolean(), track_clicks: z.boolean(), transactional_track_opens: z.boolean().default(false), transactional_track_clicks: z.boolean().default(false),
  timezone: z.string().min(1).default("Europe/Madrid"), content_retention_days: z.coerce.number().int().min(0).max(3650).default(90),
  content_storage:z.enum(["filesystem","s3"]).default("filesystem"),event_retention_days:z.coerce.number().int().min(30).max(3650).default(730),audit_retention_days:z.coerce.number().int().min(90).max(3650).default(1095),import_retention_days:z.coerce.number().int().min(1).max(365).default(30),personal_data_retention_days:z.coerce.number().int().min(1).max(730).default(90),
  ses_tracking_source:z.enum(["local","ses"]).default("local"),ses_suppression_sync_enabled:z.boolean().default(false),ses_suppression_sync_mode:z.enum(["import","bidirectional"]).default("import"),
  bounce_alert_threshold:z.coerce.number().min(0.000001).max(1).default(0.02),complaint_alert_threshold:z.coerce.number().min(0.000001).max(1).default(0.001),delay_alert_threshold:z.coerce.number().min(0.000001).max(1).default(0.05),
  allowed_sender_domains:z.array(z.string().trim().min(1).max(253).regex(/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i)).max(50).default([]),global_sending_paused:z.boolean().default(false),
});

export async function PATCH(request: Request) {
  const unauthorized = await requireApiSession("settings:write"); if (unauthorized) return unauthorized;
  try {
    const session=await getCurrentSession();
    const input = schema.parse(await request.json());
    if(input.content_storage==="s3"&&!env.s3Bucket)throw new Error("Configura S3_BUCKET antes de activar el backend S3");
    const[previous]=await sql<{global_sending_paused:boolean}[]>`SELECT global_sending_paused FROM settings WHERE id=1`;
    await sql`UPDATE settings SET organization_name=${input.organization_name}, ui_theme=${input.ui_theme}, default_from_name=${input.default_from_name}, default_from_email=${input.default_from_email}, default_reply_to=${input.default_reply_to}, aws_region=${input.aws_region}, ses_configuration_set=${input.ses_configuration_set}, ses_marketing_configuration_set=${input.ses_marketing_configuration_set}, ses_transactional_configuration_set=${input.ses_transactional_configuration_set}, mail_transport=${input.mail_transport}, sending_rate=${input.sending_rate}, campaign_sending_rate=${input.campaign_sending_rate}, transactional_reserved_rate=${input.transactional_reserved_rate}, physical_address=${input.physical_address}, track_opens=${input.track_opens}, track_clicks=${input.track_clicks}, transactional_track_opens=${input.transactional_track_opens}, transactional_track_clicks=${input.transactional_track_clicks}, timezone=${input.timezone}, content_retention_days=${input.content_retention_days},content_storage=${input.content_storage},event_retention_days=${input.event_retention_days},audit_retention_days=${input.audit_retention_days},import_retention_days=${input.import_retention_days},personal_data_retention_days=${input.personal_data_retention_days},ses_tracking_source=${input.ses_tracking_source},ses_suppression_sync_enabled=${input.ses_suppression_sync_enabled},ses_suppression_sync_mode=${input.ses_suppression_sync_mode},bounce_alert_threshold=${input.bounce_alert_threshold},complaint_alert_threshold=${input.complaint_alert_threshold},delay_alert_threshold=${input.delay_alert_threshold},allowed_sender_domains=${input.allowed_sender_domains},global_sending_paused=${input.global_sending_paused}, updated_at=now() WHERE id=1`;
    await sql`INSERT INTO audit_log(action,entity_type,entity_id,user_id,request_id,detail)VALUES('update','settings','00000000-0000-0000-0000-000000000001',${session?.user.id??null},${request.headers.get("x-request-id")},${sql.json({ui_theme:input.ui_theme,mail_transport:input.mail_transport,content_storage:input.content_storage,global_sending_paused:input.global_sending_paused})})`;
    if(previous?.global_sending_paused&&!input.global_sending_paused)await Promise.all([recoverQueuedRecipients(),recoverQueuedTransactionalMessages({includeFresh:true})]);
    return NextResponse.json({ ok: true });
  } catch (error) { return apiError(error); }
}
