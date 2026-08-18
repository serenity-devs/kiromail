import { readFileSync } from "node:fs";

function secret(name: string, fallback = "") {
  const file = process.env[`${name}_FILE`]?.trim();
  if (file) {
    try {
      return readFileSync(file, "utf8").trim();
    } catch (error) {
      throw new Error(`No se pudo leer el secreto ${name} desde ${file}: ${error instanceof Error ? error.message : "error desconocido"}`);
    }
  }
  return process.env[name] ?? fallback;
}

const sessionSecret = secret("SESSION_SECRET", "change-me-in-production-kiromail");
const awsAccessKeyId = secret("AWS_ACCESS_KEY_ID").trim();
const awsSecretAccessKey = secret("AWS_SECRET_ACCESS_KEY").trim();
const awsSessionToken = secret("AWS_SESSION_TOKEN").trim();

export const env = {
  appUrl: process.env.APP_URL ?? "http://localhost:3000",
  adminEmail: process.env.ADMIN_EMAIL ?? "admin@kiromail.local",
  adminPassword: secret("ADMIN_PASSWORD", "kiromail-local-2026"),
  sessionSecret,
  databaseUrl: secret("DATABASE_URL", "postgres://kiromail:kiromail@localhost:5432/kiromail"),
  redisUrl: secret("REDIS_URL", "redis://localhost:6379"),
  mailTransport: process.env.MAIL_TRANSPORT === "ses" || process.env.MAIL_TRANSPORT === "smtp" ? process.env.MAIL_TRANSPORT : undefined,
  smtpHost: process.env.SMTP_HOST ?? "localhost",
  smtpPort: Number(process.env.SMTP_PORT ?? 1025),
  awsRegion: process.env.AWS_REGION?.trim() || undefined,
  awsCredentials: awsAccessKeyId && awsSecretAccessKey ? {
    accessKeyId: awsAccessKeyId,
    secretAccessKey: awsSecretAccessKey,
    ...(awsSessionToken ? { sessionToken: awsSessionToken } : {}),
  } : undefined,
  awsCredentialsComplete: Boolean(awsAccessKeyId) === Boolean(awsSecretAccessKey),
  uploadDir: process.env.UPLOAD_DIR ?? "./uploads",
  contentStorageDir: process.env.CONTENT_STORAGE_DIR ?? "./message-content",
  contentStorage: process.env.CONTENT_STORAGE === "s3" ? "s3" as const : process.env.CONTENT_STORAGE === "filesystem" ? "filesystem" as const : undefined,
  s3Bucket: process.env.S3_BUCKET?.trim() ?? "",
  s3Prefix: (process.env.S3_PREFIX ?? "kiromail").replace(/^\/+|\/+$/g, ""),
  s3Endpoint: process.env.S3_ENDPOINT?.trim() || undefined,
  s3ForcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
  snsTopicArns: (process.env.SNS_TOPIC_ARNS ?? "").split(",").map((value) => value.trim()).filter(Boolean),
  dataEncryptionKey: secret("DATA_ENCRYPTION_KEY", sessionSecret),
  allowPrivateWebhooks: process.env.ALLOW_PRIVATE_WEBHOOKS === "true",
  transactionalAttachmentMaxBytes: Number(process.env.TRANSACTIONAL_ATTACHMENT_MAX_BYTES ?? 8 * 1024 * 1024),
  transactionalMimeMaxBytes: Number(process.env.TRANSACTIONAL_MIME_MAX_BYTES ?? 40_000_000),
  trustProxy: process.env.TRUST_PROXY === "true",
  apiRateLimitPerMinute: Number(process.env.API_RATE_LIMIT_PER_MINUTE ?? 600),
  sessionRateLimitPerMinute: Number(process.env.SESSION_RATE_LIMIT_PER_MINUTE ?? 900),
  publicRateLimitPerMinute: Number(process.env.PUBLIC_RATE_LIMIT_PER_MINUTE ?? 30),
  instanceId: process.env.INSTANCE_ID ?? process.env.HOSTNAME ?? "local",
  metricsToken: secret("METRICS_TOKEN"),
};

export function publicAppUrl(pathname: string) {
  return new URL(pathname, env.appUrl);
}

export function productionConfigurationChecks() {
  const production = env.appUrl.startsWith("https://");
  const checks = [
    { key: "https", ok: !production || env.appUrl.startsWith("https://"), required: production, detail: production ? "APP_URL usa HTTPS." : "Modo local HTTP." },
    { key: "session_secret", ok: !production || (env.sessionSecret.length >= 32 && !env.sessionSecret.includes("change-me") && !env.sessionSecret.includes("local-only")), required: production, detail: "SESSION_SECRET debe ser aleatorio y tener al menos 32 caracteres." },
    { key: "encryption_key", ok: !production || (env.dataEncryptionKey.length >= 32 && env.dataEncryptionKey !== env.sessionSecret && !env.dataEncryptionKey.includes("local-only")), required: production, detail: "DATA_ENCRYPTION_KEY debe ser independiente y tener al menos 32 caracteres." },
    { key: "admin_password", ok: !production || (env.adminPassword.length >= 16 && env.adminPassword !== "kiromail-local-2026"), required: production, detail: "La contraseña de bootstrap no puede ser la local." },
    { key: "admin_email", ok: !production || (!env.adminEmail.endsWith(".local") && env.adminEmail.includes("@")), required: production, detail: "ADMIN_EMAIL debe ser una cuenta real, no el usuario local." },
    { key: "database_credentials", ok: !production || !env.databaseUrl.includes("kiromail:kiromail@"), required: production, detail: "PostgreSQL no puede conservar la contraseña local." },
    { key: "redis_credentials", ok: !production || (() => { try { return Boolean(new URL(env.redisUrl).password); } catch { return false; } })(), required: production, detail: "Redis debe exigir autenticación en producción." },
    { key: "metrics_token", ok: !production || env.metricsToken.length >= 32, required: production, detail: "METRICS_TOKEN debe ser independiente y tener al menos 32 caracteres." },
    { key: "s3", ok: env.contentStorage !== "s3" || Boolean(env.s3Bucket), required: env.contentStorage === "s3", detail: "S3_BUCKET es obligatorio con CONTENT_STORAGE=s3." },
    { key: "aws_credentials", ok: env.awsCredentialsComplete, required: Boolean(awsAccessKeyId || awsSecretAccessKey), detail: "Las credenciales AWS explícitas deben incluir identificador y secreto; un rol IAM no necesita ninguna." },
    { key: "rate_limits", ok: [env.apiRateLimitPerMinute, env.sessionRateLimitPerMinute, env.publicRateLimitPerMinute].every((value) => Number.isInteger(value) && value > 0), required: true, detail: "Los límites por minuto deben ser enteros positivos." },
    { key: "message_limits", ok: [env.transactionalAttachmentMaxBytes,env.transactionalMimeMaxBytes].every((value)=>Number.isSafeInteger(value)&&value>0)&&env.transactionalAttachmentMaxBytes<env.transactionalMimeMaxBytes,required:true,detail:"Los límites de adjuntos/MIME deben ser enteros positivos y el MIME debe admitir la sobrecarga de codificación." },
  ];
  return { production, ready: checks.every((item) => !item.required || item.ok), checks };
}
