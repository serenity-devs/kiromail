import { NextResponse } from "next/server";
import { productionConfigurationChecks } from "@/lib/config";
import { env } from "@/lib/config";
import { sql } from "@/lib/db";
import { queueCounts } from "@/lib/operations";

export async function GET(){
  const started=Date.now();
  try{
    await sql`SELECT 1`;
    const [queues,[settings],[adminSecurity],[demoData]]=await Promise.all([
      queueCounts(),
      sql<{mail_transport:"smtp"|"ses";default_from_email:string;physical_address:string;ses_marketing_configuration_set:string;ses_transactional_configuration_set:string;content_storage:"filesystem"|"s3"}[]>`
        SELECT mail_transport,default_from_email,physical_address,
          ses_marketing_configuration_set,ses_transactional_configuration_set,
          content_storage
        FROM settings WHERE id=1
      `,
      sql<{secure_admins:number}[]>`
        SELECT (count(*) FILTER (WHERE role='admin' AND status='active' AND mfa_enabled))::int AS secure_admins
        FROM users
      `,
      sql<{demo_rows:number}[]>`
        SELECT (
          (SELECT count(*) FROM contacts WHERE id BETWEEN '30000000-0000-4000-8000-000000000001'::uuid AND '30000000-0000-4000-8000-000000000006'::uuid) +
          (SELECT count(*) FROM campaigns WHERE id BETWEEN '60000000-0000-4000-8000-000000000001'::uuid AND '60000000-0000-4000-8000-000000000003'::uuid)
        )::int AS demo_rows
      `,
    ]);
    const baseConfiguration=productionConfigurationChecks();
    const production=baseConfiguration.production;
    const effectiveTransport=env.mailTransport??settings?.mail_transport;
    const storedChecks=[
      {key:"ses_transport",ok:!production||effectiveTransport==="ses",required:production,detail:"Amazon SES debe ser el transporte efectivo antes del estreno."},
      {key:"sender_identity",ok:!production||Boolean(settings&&!settings.default_from_email.endsWith(".local")),required:production,detail:"El remitente guardado debe usar un dominio real verificado."},
      {key:"physical_address",ok:!production||Boolean(settings&&settings.physical_address.trim().length>8&&!settings.physical_address.toLowerCase().includes("configura aquí")),required:production,detail:"La dirección postal no puede conservar el marcador local."},
      {key:"configuration_sets",ok:!production||Boolean(settings?.ses_marketing_configuration_set&&settings?.ses_transactional_configuration_set&&settings.ses_marketing_configuration_set!==settings.ses_transactional_configuration_set),required:production,detail:"Marketing y transaccional necesitan Configuration Sets distintos."},
      {key:"sns_topics",ok:!production||env.snsTopicArns.length>0,required:production,detail:"SNS_TOPIC_ARNS debe autorizar al menos un Topic de eventos SES."},
      {key:"s3_bucket",ok:!production||settings?.content_storage!=="s3"||Boolean(env.s3Bucket),required:production&&settings?.content_storage==="s3",detail:"S3_BUCKET es obligatorio cuando el ajuste guardado usa S3."},
      {key:"admin_mfa",ok:!production||Number(adminSecurity?.secure_admins??0)>0,required:production,detail:"Debe existir al menos un administrador activo con MFA."},
      {key:"demo_data",ok:!production||Number(demoData?.demo_rows??0)===0,required:production,detail:"La base de producción no puede contener el seed de demostración."},
    ];
    const configuration={...baseConfiguration,ready:baseConfiguration.ready&&storedChecks.every((item)=>!item.required||item.ok),checks:[...baseConfiguration.checks,...storedChecks]};
    const status=configuration.ready?"ready":"not_ready";
    return NextResponse.json({status,database:"ok",redis:"ok",configuration,queues,latency_ms:Date.now()-started},{status:configuration.ready?200:503,headers:{"Cache-Control":"no-store"}});
  }catch(error){return NextResponse.json({status:"not_ready",error:error instanceof Error?error.message:"Dependencia no disponible",latency_ms:Date.now()-started},{status:503,headers:{"Cache-Control":"no-store"}});}
}
