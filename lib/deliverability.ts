import nodemailer from "nodemailer";
import {
  GetAccountCommand,
  GetConfigurationSetEventDestinationsCommand,
  GetEmailIdentityCommand,
  ListConfigurationSetsCommand,
  ListEmailIdentitiesCommand,
  ListSuppressedDestinationsCommand,
  PutSuppressedDestinationCommand,
  SendEmailCommand,
  SESv2Client,
  type EventDestination,
  type GetAccountResponse,
} from "@aws-sdk/client-sesv2";
import { env } from "./config";
import { sql } from "./db";

export type DeliverabilitySettings = {
  organization_name: string;
  default_from_name: string;
  default_from_email: string;
  default_reply_to: string;
  mail_transport: "smtp" | "ses";
  aws_region: string;
  ses_configuration_set: string;
  ses_marketing_configuration_set: string;
  ses_transactional_configuration_set: string;
  ses_tracking_source: "local" | "ses";
  ses_suppression_sync_enabled: boolean;
  ses_suppression_sync_mode: "import" | "bidirectional";
  bounce_alert_threshold: string | number;
  complaint_alert_threshold: string | number;
  delay_alert_threshold: string | number;
  allowed_sender_domains: string[];
  global_sending_paused: boolean;
};

export type HealthCheck = {
  key: string;
  label: string;
  status: "pass" | "warning" | "fail" | "info";
  detail: string;
};

type Identity = {
  name: string;
  type: string;
  sending_enabled: boolean;
  verification_status: string;
  verified_for_sending: boolean;
  dkim_status: string | null;
  dkim_signing_enabled: boolean;
  mail_from_domain: string | null;
  mail_from_status: string | null;
  configuration_set: string | null;
};

type ConfigurationSet = {
  name: string;
  destinations: { name: string; enabled: boolean; event_types: string[]; sns_topic_arn: string | null }[];
};

export type SesCheckInput = {
  account: {
    production_access: boolean;
    sending_enabled: boolean;
    enforcement_status: string;
  };
  identities: Identity[];
  configurationSets: ConfigurationSet[];
  settings: Pick<DeliverabilitySettings, "default_from_email" | "ses_marketing_configuration_set" | "ses_transactional_configuration_set" | "ses_tracking_source">;
  appUrl: string;
  allowedTopicArns:string[];
};

const requiredEvents = ["SEND", "DELIVERY", "BOUNCE", "COMPLAINT", "REJECT", "DELIVERY_DELAY", "RENDERING_FAILURE"];

function effectiveTransport(settings: Pick<DeliverabilitySettings, "mail_transport">) {
  return env.mailTransport ?? settings.mail_transport;
}

function effectiveRegion(settings: Pick<DeliverabilitySettings, "aws_region">) {
  return env.awsRegion ?? settings.aws_region;
}

export async function getDeliverabilitySettings() {
  const [settings] = await sql<DeliverabilitySettings[]>`SELECT * FROM settings WHERE id=1`;
  if (!settings) throw new Error("No existe configuración de envío");
  return settings;
}

export function senderIsAllowed(email: string, settings: Pick<DeliverabilitySettings, "default_from_email" | "allowed_sender_domains">) {
  const normalized = email.trim().toLowerCase();
  if (normalized === settings.default_from_email.trim().toLowerCase()) return true;
  const domain = normalized.split("@")[1] ?? "";
  return (settings.allowed_sender_domains ?? []).some((allowed) => allowed.trim().toLowerCase().replace(/^@/, "") === domain);
}

export async function assertSendingAvailable(fromEmail?: string) {
  const settings = await getDeliverabilitySettings();
  if (settings.global_sending_paused) throw new Error("Los envíos están pausados globalmente por un administrador");
  if (fromEmail && !senderIsAllowed(fromEmail, settings)) throw new Error("El remitente no está en la lista permitida");
  return settings;
}

function identityCovers(identity: Identity, email: string) {
  const normalized = email.toLowerCase();
  return identity.type === "EMAIL_ADDRESS" ? identity.name.toLowerCase() === normalized : normalized.endsWith(`@${identity.name.toLowerCase()}`);
}

export function buildSesChecks(input: SesCheckInput): HealthCheck[] {
  const senderIdentities = input.identities.filter((identity) => identityCovers(identity, input.settings.default_from_email));
  const verifiedSender = senderIdentities.some((identity) => identity.verified_for_sending && identity.sending_enabled);
  const domainIdentities = senderIdentities.filter((identity) => identity.type === "DOMAIN");
  const configured = [input.settings.ses_marketing_configuration_set, input.settings.ses_transactional_configuration_set].filter(Boolean);
  const configuredDetails = configured.map((name) => input.configurationSets.find((item) => item.name === name));
  const enabledDestinations = configuredDetails.flatMap((item) => item?.destinations.filter((destination) => destination.enabled) ?? []);
  const publishedEvents = new Set(enabledDestinations.flatMap((destination) => destination.event_types));
  const missingEventsBySet = configuredDetails.flatMap((item, index) => {
    const events = new Set(item?.destinations.filter((destination) => destination.enabled).flatMap((destination) => destination.event_types) ?? []);
    const missing = requiredEvents.filter((event) => !events.has(event));
    return missing.length ? [`${configured[index] ?? "sin configurar"}: ${missing.join(", ")}`] : [];
  });
  const interactionEvents = ["OPEN", "CLICK"].filter((event) => publishedEvents.has(event));
  const trackingMatches = input.settings.ses_tracking_source === "ses" ? interactionEvents.length === 2 : interactionEvents.length === 0;
  const snsCovered=configuredDetails.length===2&&configuredDetails.every(item=>item?.destinations.some(destination=>destination.enabled&&Boolean(destination.sns_topic_arn)&&input.allowedTopicArns.includes(destination.sns_topic_arn!)));
  return [
    { key: "account_access", label: "Acceso a SES", status: "pass", detail: "Las credenciales o el rol IAM permiten consultar la cuenta." },
    { key: "production_access", label: "Acceso a producción", status: input.account.production_access ? "pass" : "warning", detail: input.account.production_access ? "La cuenta puede enviar a destinatarios no verificados." : "La cuenta sigue en sandbox y solo puede enviar a identidades verificadas." },
    { key: "sending_enabled", label: "Envío habilitado", status: input.account.sending_enabled ? "pass" : "fail", detail: input.account.sending_enabled ? "Amazon SES permite nuevos envíos." : "Amazon SES tiene el envío deshabilitado en esta región." },
    { key: "enforcement", label: "Estado de reputación SES", status: input.account.enforcement_status === "HEALTHY" ? "pass" : "fail", detail: `Estado comunicado por SES: ${input.account.enforcement_status || "desconocido"}.` },
    { key: "sender_identity", label: "Identidad remitente", status: verifiedSender ? "pass" : "fail", detail: verifiedSender ? `${input.settings.default_from_email} está cubierta por una identidad verificada.` : `${input.settings.default_from_email} no está cubierta por una identidad verificada y habilitada.` },
    { key: "dkim", label: "DKIM", status: domainIdentities.some((identity) => identity.dkim_signing_enabled && identity.dkim_status === "SUCCESS") ? "pass" : "warning", detail: domainIdentities.some((identity) => identity.dkim_signing_enabled && identity.dkim_status === "SUCCESS") ? "Firma DKIM activa y verificada para el dominio remitente." : "No se detecta una identidad de dominio con DKIM verificado." },
    { key: "mail_from", label: "MAIL FROM personalizado", status: domainIdentities.some((identity) => identity.mail_from_domain && identity.mail_from_status === "SUCCESS") ? "pass" : "warning", detail: domainIdentities.some((identity) => identity.mail_from_domain && identity.mail_from_status === "SUCCESS") ? "El dominio MAIL FROM personalizado está verificado." : "Se usa el MAIL FROM predeterminado o todavía no está verificado." },
    { key: "configuration_sets", label: "Configuration Sets separados", status: configured.length === 2 && configured[0] !== configured[1] && configuredDetails.every(Boolean) ? "pass" : "fail", detail: configured.length === 2 && configured[0] !== configured[1] && configuredDetails.every(Boolean) ? "Marketing y transaccional tienen Configuration Sets existentes y distintos." : "Configura dos Configuration Sets existentes y diferentes." },
    { key: "event_destination", label: "Eventos de entrega", status: missingEventsBySet.length || configuredDetails.length !== 2 ? "fail" : "pass", detail: missingEventsBySet.length ? `Faltan eventos obligatorios por Configuration Set: ${missingEventsBySet.join("; ")}.` : configuredDetails.length === 2 ? "Cada Configuration Set publica todos los eventos operativos obligatorios." : "Configura ambos Configuration Sets y sus destinos de eventos." },
    { key:"sns_topics",label:"Topics SNS autorizados",status:snsCovered?"pass":"fail",detail:snsCovered?"Ambos Configuration Sets publican en un TopicArn incluido en SNS_TOPIC_ARNS.":"Cada Configuration Set debe publicar en SNS y su TopicArn debe figurar en SNS_TOPIC_ARNS."},
    { key: "tracking_source", label: "Fuente única de interacción", status: trackingMatches ? "pass" : "warning", detail: trackingMatches ? `Aperturas y clics usan únicamente ${input.settings.ses_tracking_source === "ses" ? "Amazon SES" : "el seguimiento local"}.` : input.settings.ses_tracking_source === "ses" ? "El destino no publica OPEN y CLICK aunque SES es la fuente elegida." : "El destino publica OPEN o CLICK mientras el seguimiento local está activo; podrían duplicarse." },
    { key: "public_url", label: "URL pública segura", status: input.appUrl.startsWith("https://") ? "pass" : "warning", detail: input.appUrl.startsWith("https://") ? "Tracking, preferencias y webhooks usan HTTPS." : "Configura APP_URL con HTTPS antes de producir." },
    { key: "dns_policy", label: "SPF, DMARC y alineación", status: "info", detail: "Verifica SPF, una política DMARC gradual y la alineación del From en el proveedor DNS." },
    { key: "warming", label: "Calentamiento de volumen", status: "info", detail: "Aumenta gradualmente el volumen de dominios o IP nuevas y vigila rebotes y quejas." },
  ];
}

async function listIdentities(client: SESv2Client) {
  const result: { name: string; type: string; sendingEnabled: boolean; verificationStatus: string }[] = [];
  let token: string | undefined;
  do {
    const page = await client.send(new ListEmailIdentitiesCommand({ NextToken: token, PageSize: 100 }));
    result.push(...(page.EmailIdentities ?? []).filter((identity) => identity.IdentityName).map((identity) => ({
      name: identity.IdentityName!, type: identity.IdentityType ?? "UNKNOWN", sendingEnabled: Boolean(identity.SendingEnabled), verificationStatus: identity.VerificationStatus ?? "UNKNOWN",
    })));
    token = page.NextToken;
  } while (token && result.length < 1000);
  return result;
}

async function listConfigurationSetNames(client: SESv2Client) {
  const result: string[] = [];
  let token: string | undefined;
  do {
    const page = await client.send(new ListConfigurationSetsCommand({ NextToken: token, PageSize: 100 }));
    result.push(...(page.ConfigurationSets ?? []));
    token = page.NextToken;
  } while (token && result.length < 1000);
  return result;
}

function eventDestination(destination: EventDestination) {
  return {
    name: destination.Name ?? "Destino sin nombre",
    enabled: Boolean(destination.Enabled),
    event_types: destination.MatchingEventTypes ?? [],
    sns_topic_arn: destination.SnsDestination?.TopicArn ?? null,
  };
}

function safeError(error: unknown) {
  const value = error as { name?: string; message?: string };
  return { code: (value.name || "SES_ERROR").slice(0, 120), message: (value.message || "No se pudo consultar Amazon SES").slice(0, 500) };
}

function accountSnapshot(account: GetAccountResponse) {
  return {
    production_access: Boolean(account.ProductionAccessEnabled),
    sending_enabled: Boolean(account.SendingEnabled),
    enforcement_status: account.EnforcementStatus ?? "UNKNOWN",
    quota: {
      max_24_hour_send: account.SendQuota?.Max24HourSend ?? null,
      max_send_rate: account.SendQuota?.MaxSendRate ?? null,
      sent_last_24_hours: account.SendQuota?.SentLast24Hours ?? null,
    },
    suppression_reasons: account.SuppressionAttributes?.SuppressedReasons ?? [],
    dedicated_ip_auto_warmup: account.DedicatedIpAutoWarmupEnabled ?? null,
    vdm_enabled: account.VdmAttributes?.VdmEnabled ?? null,
  };
}

export async function refreshDeliverabilityHealth() {
  const settings = await getDeliverabilitySettings();
  const transport = effectiveTransport(settings);
  const region = effectiveRegion(settings);
  if (transport === "smtp") {
    const checks: HealthCheck[] = [
      { key: "local_transport", label: "Transporte local", status: "pass", detail: `Mailpit está configurado en ${env.smtpHost}:${env.smtpPort}.` },
      { key: "production_disabled", label: "Salida a Internet", status: "info", detail: "El modo local no usa Amazon SES ni entrega correo real." },
    ];
    const [snapshot] = await sql`INSERT INTO ses_health_snapshots(transport,region,status,account,checks) VALUES('smtp',${region},'local',${sql.json({ mode: "mailpit", host: env.smtpHost, port: env.smtpPort })},${sql.json(checks as never)}) RETURNING *`;
    return snapshot;
  }
  const client = new SESv2Client({ region, credentials: env.awsCredentials });
  try {
    const [accountResponse, identityRows, configurationSetNames] = await Promise.all([client.send(new GetAccountCommand({})), listIdentities(client), listConfigurationSetNames(client)]);
    const identities: Identity[] = await Promise.all(identityRows.map(async (identity) => {
      const detail = await client.send(new GetEmailIdentityCommand({ EmailIdentity: identity.name }));
      return {
        name: identity.name, type: identity.type, sending_enabled: identity.sendingEnabled,
        verification_status: detail.VerificationStatus ?? identity.verificationStatus,
        verified_for_sending: Boolean(detail.VerifiedForSendingStatus), dkim_status: detail.DkimAttributes?.Status ?? null,
        dkim_signing_enabled: Boolean(detail.DkimAttributes?.SigningEnabled), mail_from_domain: detail.MailFromAttributes?.MailFromDomain ?? null,
        mail_from_status: detail.MailFromAttributes?.MailFromDomainStatus ?? null, configuration_set: detail.ConfigurationSetName ?? null,
      };
    }));
    const relevantSets = [...new Set([settings.ses_marketing_configuration_set, settings.ses_transactional_configuration_set].filter(Boolean))];
    const configurationSets: ConfigurationSet[] = await Promise.all(relevantSets.map(async (name) => {
      if (!configurationSetNames.includes(name)) return { name, destinations: [] };
      const response = await client.send(new GetConfigurationSetEventDestinationsCommand({ ConfigurationSetName: name }));
      return { name, destinations: (response.EventDestinations ?? []).map(eventDestination) };
    }));
    for (const name of configurationSetNames) if (!configurationSets.some((item) => item.name === name)) configurationSets.push({ name, destinations: [] });
    const account = accountSnapshot(accountResponse);
    const checks = buildSesChecks({ account, identities, configurationSets, settings, appUrl: env.appUrl,allowedTopicArns:env.snsTopicArns });
    const status = checks.some((check) => check.status === "fail") ? "error" : checks.some((check) => check.status === "warning") ? "warning" : "healthy";
    const [snapshot] = await sql`INSERT INTO ses_health_snapshots(transport,region,status,account,identities,configuration_sets,checks) VALUES('ses',${region},${status},${sql.json(account as never)},${sql.json(identities as never)},${sql.json(configurationSets as never)},${sql.json(checks as never)}) RETURNING *`;
    return snapshot;
  } catch (error) {
    const failure = safeError(error);
    const checks: HealthCheck[] = [{ key: "account_access", label: "Acceso a SES", status: "fail", detail: failure.message }];
    const [snapshot] = await sql`INSERT INTO ses_health_snapshots(transport,region,status,checks,error_code,error_message) VALUES('ses',${region},'error',${sql.json(checks as never)},${failure.code},${failure.message}) RETURNING *`;
    return snapshot;
  } finally {
    client.destroy();
  }
}

async function reputation(days: number) {
  const rows = await sql<{ channel: "campaign" | "transactional"; sent: number; delivered: number; bounced: number; complained: number; delayed: number; rejected: number }[]>`
    WITH event_counts AS (
      SELECT message_id,
        bool_or(type IN ('bounced','bounce')) AS bounced,
        bool_or(type IN ('complained','complaint')) AS complained,
        bool_or(type='delivery_delayed') AS delayed,
        bool_or(type='rejected') AS rejected
      FROM email_events WHERE occurred_at >= now() - (${days}::text || ' days')::interval GROUP BY message_id
    )
    SELECT m.kind AS channel,
      count(*) FILTER (WHERE m.sent_at IS NOT NULL)::int AS sent,
      count(*) FILTER (WHERE m.delivered_at IS NOT NULL OR m.status='delivered')::int AS delivered,
      count(*) FILTER (WHERE m.status='bounced' OR e.bounced)::int AS bounced,
      count(*) FILTER (WHERE m.status='complained' OR e.complained)::int AS complained,
      count(*) FILTER (WHERE m.status='delayed' OR e.delayed)::int AS delayed,
      count(*) FILTER (WHERE e.rejected)::int AS rejected
    FROM outbound_messages m LEFT JOIN event_counts e ON e.message_id=m.id
    WHERE m.created_at >= now() - (${days}::text || ' days')::interval
    GROUP BY m.kind ORDER BY m.kind
  `;
  const normalize = (row: typeof rows[number] | undefined, channel: string) => {
    const sent = Number(row?.sent ?? 0); const bounced = Number(row?.bounced ?? 0); const complained = Number(row?.complained ?? 0); const delayed = Number(row?.delayed ?? 0);
    return { channel, sent, delivered: Number(row?.delivered ?? 0), bounced, complained, delayed, rejected: Number(row?.rejected ?? 0), bounce_rate: sent ? bounced / sent : 0, complaint_rate: sent ? complained / sent : 0, delay_rate: sent ? delayed / sent : 0 };
  };
  const marketing = normalize(rows.find((row) => row.channel === "campaign"), "marketing");
  const transactional = normalize(rows.find((row) => row.channel === "transactional"), "transactional");
  const all = normalize({ channel: "campaign", sent: marketing.sent + transactional.sent, delivered: marketing.delivered + transactional.delivered, bounced: marketing.bounced + transactional.bounced, complained: marketing.complained + transactional.complained, delayed: marketing.delayed + transactional.delayed, rejected: marketing.rejected + transactional.rejected }, "all");
  return { days, all, channels: [marketing, transactional] };
}

async function reputationTrend(days = 30) {
  return sql<{ date: Date; sent: number; delivered: number; bounced: number; complained: number; delayed: number }[]>`
    WITH days AS (SELECT generate_series(CURRENT_DATE-${days - 1}::integer,CURRENT_DATE,'1 day'::interval)::date AS date), events AS (
      SELECT message_id,occurred_at::date AS date,
        bool_or(type IN ('bounced','bounce')) AS bounced,bool_or(type IN ('complained','complaint')) AS complained,bool_or(type='delivery_delayed') AS delayed
      FROM email_events WHERE occurred_at>=CURRENT_DATE-${days - 1}::integer GROUP BY message_id,occurred_at::date
    ) SELECT d.date,
      count(DISTINCT m.id) FILTER(WHERE m.sent_at IS NOT NULL)::int AS sent,
      count(DISTINCT m.id) FILTER(WHERE m.delivered_at IS NOT NULL OR m.status='delivered')::int AS delivered,
      count(DISTINCT e.message_id) FILTER(WHERE e.bounced)::int AS bounced,
      count(DISTINCT e.message_id) FILTER(WHERE e.complained)::int AS complained,
      count(DISTINCT e.message_id) FILTER(WHERE e.delayed)::int AS delayed
    FROM days d LEFT JOIN outbound_messages m ON m.created_at::date=d.date LEFT JOIN events e ON e.message_id=m.id AND e.date=d.date
    GROUP BY d.date ORDER BY d.date
  `;
}

async function reputationRisks() {
  const [campaigns, templates] = await Promise.all([
    sql`SELECT id,name,sent_count AS sent,bounce_count AS bounced,complaint_count AS complained,
      CASE WHEN sent_count>0 THEN bounce_count::float/sent_count ELSE 0 END AS bounce_rate,
      CASE WHEN sent_count>0 THEN complaint_count::float/sent_count ELSE 0 END AS complaint_rate
      FROM campaigns WHERE sent_count>0 ORDER BY (bounce_count+complaint_count)::float/GREATEST(sent_count,1) DESC,started_at DESC NULLS LAST LIMIT 10`,
    sql`SELECT COALESCE(t.name,'HTML directo') AS name,m.template_version_id,count(*) FILTER(WHERE m.sent_at IS NOT NULL)::int AS sent,
      count(*) FILTER(WHERE m.status='bounced')::int AS bounced,count(*) FILTER(WHERE m.status='complained')::int AS complained
      FROM outbound_messages m LEFT JOIN template_versions v ON v.id=m.template_version_id LEFT JOIN templates t ON t.id=v.template_id
      WHERE m.kind='transactional' AND m.created_at>=now()-interval '30 days' GROUP BY t.name,m.template_version_id HAVING count(*) FILTER(WHERE m.sent_at IS NOT NULL)>0
      ORDER BY count(*) FILTER(WHERE m.status IN('bounced','complained'))::float/GREATEST(count(*) FILTER(WHERE m.sent_at IS NOT NULL),1) DESC LIMIT 10`,
  ]);
  return { campaigns, templates };
}

async function refreshAlerts(reputation30: Awaited<ReturnType<typeof reputation>>, settings: DeliverabilitySettings, health: { status: string; error_message?: string | null } | undefined) {
  const active: { fingerprint: string; type: string; channel: "all" | "marketing" | "transactional"; severity: "warning" | "critical"; title: string; detail: Record<string, unknown> }[] = [];
  for (const metric of [reputation30.all, ...reputation30.channels]) {
    const channel = metric.channel as "all" | "marketing" | "transactional";
    if (metric.sent >= 20 && metric.bounce_rate >= Number(settings.bounce_alert_threshold)) active.push({ fingerprint: `bounce_rate:${channel}`, type: "bounce_rate", channel, severity: metric.bounce_rate >= Number(settings.bounce_alert_threshold) * 2 ? "critical" : "warning", title: `Tasa de rebote elevada · ${channel}`, detail: { value: metric.bounce_rate, threshold: Number(settings.bounce_alert_threshold), sent: metric.sent } });
    if (metric.sent >= 20 && metric.complaint_rate >= Number(settings.complaint_alert_threshold)) active.push({ fingerprint: `complaint_rate:${channel}`, type: "complaint_rate", channel, severity: "critical", title: `Tasa de queja elevada · ${channel}`, detail: { value: metric.complaint_rate, threshold: Number(settings.complaint_alert_threshold), sent: metric.sent } });
    if (metric.sent >= 20 && metric.delay_rate >= Number(settings.delay_alert_threshold)) active.push({ fingerprint: `delay_rate:${channel}`, type: "delay_rate", channel, severity: "warning", title: `Retrasos de entrega elevados · ${channel}`, detail: { value: metric.delay_rate, threshold: Number(settings.delay_alert_threshold), sent: metric.sent } });
  }
  if (health?.status === "error") active.push({ fingerprint: "ses_health", type: "ses_health", channel: "all", severity: "critical", title: "Amazon SES requiere atención", detail: { message: health.error_message ?? "Hay controles de producción fallidos" } });
  await sql.begin(async (tx) => {
    for (const alert of active) await tx`INSERT INTO operational_alerts(fingerprint,type,channel,severity,title,detail) VALUES(${alert.fingerprint},${alert.type},${alert.channel},${alert.severity},${alert.title},${tx.json(alert.detail as never)}) ON CONFLICT(fingerprint) WHERE status='open' DO UPDATE SET severity=EXCLUDED.severity,title=EXCLUDED.title,detail=EXCLUDED.detail,last_seen_at=now()`;
    const fingerprints = active.map((alert) => alert.fingerprint);
    await tx`UPDATE operational_alerts SET status='resolved',resolved_at=now() WHERE status='open' AND type IN('bounce_rate','complaint_rate','delay_rate','ses_health') AND NOT(fingerprint=ANY(${fingerprints}::text[]))`;
  });
}

export async function getDeliverabilityDashboard(options: { refresh?: boolean } = {}) {
  const settings = await getDeliverabilitySettings();
  let health = options.refresh ? await refreshDeliverabilityHealth() : (await sql`SELECT * FROM ses_health_snapshots ORDER BY checked_at DESC LIMIT 1`)[0];
  if (!health) health = await refreshDeliverabilityHealth();
  const [reputation7, reputation30, trend, risks, alerts, suppressionSummary, lastSync] = await Promise.all([
    reputation(7), reputation(30), reputationTrend(), reputationRisks(),
    sql`SELECT * FROM operational_alerts ORDER BY (status='open') DESC,last_seen_at DESC LIMIT 50`,
    sql`SELECT scope,reason,status,count(*)::int AS count FROM suppressions GROUP BY scope,reason,status ORDER BY status,scope,reason`,
    sql`SELECT * FROM suppression_sync_runs ORDER BY started_at DESC LIMIT 1`,
  ]);
  await refreshAlerts(reputation30, settings, health as { status: string; error_message?: string | null });
  const refreshedAlerts = await sql`SELECT * FROM operational_alerts ORDER BY (status='open') DESC,last_seen_at DESC LIMIT 50`;
  return {
    mode: { transport: effectiveTransport(settings), configured_transport: settings.mail_transport, environment_override: env.mailTransport ?? null, region: effectiveRegion(settings), region_override: env.awsRegion ?? null, local: effectiveTransport(settings) === "smtp", sending_paused: settings.global_sending_paused, tracking_source: effectiveTransport(settings)==="smtp"?"local":settings.ses_tracking_source },
    health, reputation: { seven_days: reputation7, thirty_days: reputation30, trend, risks }, alerts: refreshedAlerts.length ? refreshedAlerts : alerts,
    suppressions: { summary: suppressionSummary, sync_enabled: settings.ses_suppression_sync_enabled, sync_mode: settings.ses_suppression_sync_mode, last_sync: lastSync[0] ?? null },
    thresholds: { bounce: Number(settings.bounce_alert_threshold), complaint: Number(settings.complaint_alert_threshold), delay: Number(settings.delay_alert_threshold) },
    guidance: { postmaster_url: "https://postmaster.google.com/", dmarc_url: "https://dmarc.org/overview/", vdm_optional: true },
  };
}

async function sesSuppressions(client: SESv2Client) {
  const rows: { email: string; reason: "BOUNCE" | "COMPLAINT"; updated_at: Date }[] = [];
  let token: string | undefined;
  do {
    const page = await client.send(new ListSuppressedDestinationsCommand({ NextToken: token, PageSize: 1000 }));
    rows.push(...(page.SuppressedDestinationSummaries ?? []).filter((item) => item.EmailAddress && item.Reason && item.LastUpdateTime).map((item) => ({ email: item.EmailAddress!, reason: item.Reason! as "BOUNCE"|"COMPLAINT", updated_at: item.LastUpdateTime! })));
    token = page.NextToken;
  } while (token && rows.length < 100_000);
  return rows;
}

export async function reconcileSesSuppressions(mode: "preview" | "import" | "bidirectional") {
  const settings = await getDeliverabilitySettings();
  if (effectiveTransport(settings) !== "ses") throw new Error("La conciliación con SES solo está disponible en modo Amazon SES");
  const region = effectiveRegion(settings);
  const [run] = await sql<{ id: string }[]>`INSERT INTO suppression_sync_runs(region,mode) VALUES(${region},${mode}) RETURNING id`;
  const client = new SESv2Client({ region, credentials: env.awsCredentials });
  try {
    const [remote, local] = await Promise.all([
      sesSuppressions(client),
      sql<{ email: string; reason: "bounce" | "complaint" }[]>`SELECT lower(email) AS email,reason FROM suppressions WHERE status='active' AND scope='all' AND reason IN('bounce','complaint')`,
    ]);
    const localMap = new Map(local.map((item) => [item.email, item.reason]));
    const remoteMap = new Map(remote.map((item) => [item.email.toLowerCase(), item.reason]));
    const imports = remote.filter((item) => !localMap.has(item.email.toLowerCase()) || localMap.get(item.email.toLowerCase()) !== item.reason.toLowerCase());
    const exports = local.filter((item) => !remoteMap.has(item.email) || remoteMap.get(item.email) !== item.reason.toUpperCase());
    if (mode !== "preview") for (const item of imports) await sql`INSERT INTO suppressions(email,reason,source,scope,detail) VALUES(${item.email},${item.reason.toLowerCase()},'ses_sync','all',${sql.json({ses_updated_at:item.updated_at,region} as never)}) ON CONFLICT(lower(email),scope) DO UPDATE SET reason=EXCLUDED.reason,source='ses_sync',detail=EXCLUDED.detail,status='active',resolved_at=NULL,resolved_by=NULL,resolution_note='',updated_at=now() WHERE suppressions.reason NOT IN('privacy','merged')`;
    if (mode === "bidirectional") for (const item of exports) await client.send(new PutSuppressedDestinationCommand({ EmailAddress: item.email, Reason: item.reason.toUpperCase() as "BOUNCE" | "COMPLAINT" }));
    const detail = { imports: imports.slice(0, 100), exports: exports.slice(0, 100), truncated: imports.length > 100 || exports.length > 100 };
    const [completed] = await sql`UPDATE suppression_sync_runs SET status='completed',ses_count=${remote.length},local_count=${local.length},imported_count=${mode === "preview" ? 0 : imports.length},exported_count=${mode === "bidirectional" ? exports.length : 0},unchanged_count=${Math.max(0,remote.length-imports.length)},detail=${sql.json(detail as never)},completed_at=now() WHERE id=${run.id} RETURNING *`;
    return { ...completed, preview: mode === "preview", pending_imports: imports.length, pending_exports: exports.length };
  } catch (error) {
    const failure = safeError(error);
    await sql`UPDATE suppression_sync_runs SET status='failed',error_message=${failure.message},completed_at=now() WHERE id=${run.id}`;
    throw error;
  } finally {
    client.destroy();
  }
}

export async function sendTechnicalTest(recipient: string) {
  const settings = await assertSendingAvailable();
  const transport = effectiveTransport(settings);
  const region = effectiveRegion(settings);
  const started = performance.now();
  const subject = `[Serenity Mail] Prueba técnica ${new Date().toISOString()}`;
  const html = `<main style="font-family:Arial,sans-serif;max-width:620px;margin:auto;padding:32px"><h1>Conexión correcta</h1><p>Serenity Mail ha enviado esta prueba mediante <strong>${transport === "ses" ? "Amazon SES" : "Mailpit local"}</strong>.</p><p>Región configurada: ${region}</p></main>`;
  let providerMessageId: string;
  if (transport === "ses") {
    const client = new SESv2Client({ region, credentials: env.awsCredentials });
    try {
      const response = await client.send(new SendEmailCommand({ FromEmailAddress: `${settings.default_from_name} <${settings.default_from_email}>`, Destination: { ToAddresses: [recipient] }, ReplyToAddresses: settings.default_reply_to ? [settings.default_reply_to] : undefined, ConfigurationSetName: settings.ses_transactional_configuration_set || settings.ses_configuration_set || undefined, EmailTags: [{ Name: "channel", Value: "diagnostic" }, { Name: "message_type", Value: "technical_test" }], Content: { Simple: { Subject: { Data: subject, Charset: "UTF-8" }, Body: { Html: { Data: html, Charset: "UTF-8" }, Text: { Data: `Conexión correcta. Transporte Amazon SES. Región ${region}.`, Charset: "UTF-8" } } } } }));
      providerMessageId = response.MessageId ?? "";
    } finally { client.destroy(); }
  } else {
    const transportClient = nodemailer.createTransport({ host: env.smtpHost, port: env.smtpPort, secure: false });
    const response = await transportClient.sendMail({ from: `${settings.default_from_name} <${settings.default_from_email}>`, to: recipient, replyTo: settings.default_reply_to || undefined, subject, html, text: `Conexión correcta. Transporte Mailpit local. Región configurada ${region}.`, headers: { "X-Serenity-Diagnostic": "true" } });
    providerMessageId = response.messageId;
    transportClient.close();
  }
  const result = { sent: true, transport, region, provider_message_id: providerMessageId, elapsed_ms: Math.round((performance.now() - started) * 10) / 10 };
  await sql`INSERT INTO audit_log(action,entity_type,detail) VALUES('test_send','deliverability',${sql.json({recipient,...result} as never)})`;
  return result;
}

export async function runDeliverabilityMaintenance(options:{syncSuppressions?:boolean}={}) {
  const settings = await getDeliverabilitySettings();
  await refreshDeliverabilityHealth();
  if (options.syncSuppressions&&effectiveTransport(settings) === "ses" && settings.ses_suppression_sync_enabled) await reconcileSesSuppressions(settings.ses_suppression_sync_mode);
}
