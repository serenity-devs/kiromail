import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

function secret(name, fallback = "") {
  const file = process.env[`${name}_FILE`]?.trim();
  return file ? readFileSync(file, "utf8").trim() : (process.env[name] ?? fallback);
}

const baseUrl = (process.env.VERIFY_BASE_URL ?? process.env.APP_URL ?? "http://localhost:3100").replace(/\/$/, "");
const adminEmail = process.env.ADMIN_EMAIL ?? "admin@kiromail.local";
const adminPassword = secret("ADMIN_PASSWORD", "kiromail-local-2026");
const runId = randomUUID();
const checks = [];

function check(condition, message, detail) {
  if (!condition) throw new Error(`${message}${detail ? `: ${detail}` : ""}`);
  checks.push(message);
}

function sessionCookie(response) {
  const value = response.headers.get("set-cookie")?.match(/kiromail_session=[^;]+/)?.[0];
  if (!value) throw new Error("La respuesta de acceso no contiene la cookie de sesión");
  return value;
}

async function request(path, options = {}) {
  const headers = new Headers(options.headers);
  headers.set("X-Request-Id", options.requestId ?? `prod-e2e-${runId}`);
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers, redirect: "manual" });
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { response, body };
}

async function jsonRequest(path, method, body, cookie, origin = baseUrl, extraHeaders = {}) {
  return request(path, {
    method,
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
      ...(cookie ? { Cookie: cookie } : {}),
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  });
}

function base32Decode(value) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bits = [...value.toUpperCase().replace(/[^A-Z2-7]/g, "")]
    .map((character) => alphabet.indexOf(character).toString(2).padStart(5, "0")).join("");
  const bytes = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  return Buffer.from(bytes);
}

function totp(secret) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const digest = createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const number = ((digest[offset] & 0x7f) << 24) | ((digest[offset + 1] & 0xff) << 16) | ((digest[offset + 2] & 0xff) << 8) | (digest[offset + 3] & 0xff);
  return String(number % 1_000_000).padStart(6, "0");
}

let adminCookie = "";
let temporaryUserId = "";
let temporaryMfaEnabled = false;

try {
  const requestId = `prod-e2e-live-${runId}`;
  const live = await request("/api/health/live", { requestId });
  check(live.response.status === 200 && live.body?.status === "alive", "Liveness responde");
  check(live.response.headers.get("x-request-id") === requestId, "Propaga X-Request-Id");
  check(live.response.headers.get("x-content-type-options") === "nosniff", "Envía X-Content-Type-Options");
  check(live.response.headers.get("x-frame-options") === "DENY", "Impide framing");
  check(live.response.headers.get("content-security-policy")?.includes("frame-ancestors 'none'"), "Aplica CSP");

  const ready = await request("/api/health/ready");
  check(ready.response.status === 200 && ready.body?.database === "ok" && ready.body?.redis === "ok", "Readiness valida PostgreSQL y Redis");
  check(ready.body?.configuration?.ready === true, "La configuración efectiva está lista");

  const login = await jsonRequest("/api/auth/login", "POST", { email: adminEmail, password: adminPassword });
  check(login.response.status === 200 && login.body?.user?.role === "admin", "Acceso administrativo funciona");
  adminCookie = sessionCookie(login.response);

  const operations = await request("/api/v1/operations", { headers: { Cookie: adminCookie } });
  check(operations.response.status === 200, "Operaciones requiere y acepta administrador");
  check(operations.body?.workers?.some((worker) => worker.healthy), "Worker publica heartbeat saludable");
  check(Object.values(operations.body?.queues ?? {}).every((queue) => Number(queue.failed ?? 0) === 0), "Colas sin trabajos fallidos");

  const metrics = await request("/api/metrics", { headers: { Cookie: adminCookie } });
  check(metrics.response.status === 200 && String(metrics.body).includes("kiromail_up 1"), "Métricas Prometheus disponibles");

  const csrf = await jsonRequest("/api/users", "POST", {
    email: `csrf-${runId}@example.test`, name: "CSRF rechazado", role: "analyst", password: randomBytes(24).toString("base64url"),
  }, adminCookie, "https://attacker.invalid");
  check(csrf.response.status === 403 && csrf.body?.error?.code === "csrf_rejected", "CSRF rechaza un origen externo");

  const temporaryEmail = `production-e2e-${runId}@example.test`;
  const temporaryPassword = `E2E-${randomBytes(24).toString("base64url")}`;
  const created = await jsonRequest("/api/users", "POST", { email: temporaryEmail, name: "Verificación automática", role: "admin", password: temporaryPassword }, adminCookie);
  check(created.response.status === 201 && created.body?.id, "Crea usuario temporal para MFA");
  temporaryUserId = created.body.id;

  const temporaryLogin = await jsonRequest("/api/auth/login", "POST", { email: temporaryEmail, password: temporaryPassword });
  check(temporaryLogin.response.status === 200, "Usuario temporal inicia sesión");
  const temporaryCookie = sessionCookie(temporaryLogin.response);

  const setup = await jsonRequest("/api/auth/mfa", "POST", {}, temporaryCookie);
  check(setup.response.status === 200 && setup.body?.secret && setup.body?.qr_data_url?.startsWith("data:image/png;base64,"), "MFA genera secreto y QR");

  const enabled = await jsonRequest("/api/auth/mfa", "PUT", { code: totp(setup.body.secret) }, temporaryCookie);
  check(enabled.response.status === 200 && enabled.body?.recovery_codes?.length === 8, "MFA activa y entrega ocho códigos de recuperación");
  temporaryMfaEnabled = true;

  const missingMfa = await jsonRequest("/api/auth/login", "POST", { email: temporaryEmail, password: temporaryPassword });
  check(missingMfa.response.status === 401 && missingMfa.body?.code === "mfa_required", "El acceso exige segundo factor");

  const totpLogin = await jsonRequest("/api/auth/login", "POST", { email: temporaryEmail, password: temporaryPassword, mfa_code: totp(setup.body.secret) });
  check(totpLogin.response.status === 200, "El acceso TOTP funciona");

  const recoveryLogin = await jsonRequest("/api/auth/login", "POST", { email: temporaryEmail, password: temporaryPassword, mfa_code: enabled.body.recovery_codes[0] });
  check(recoveryLogin.response.status === 200, "Un código de recuperación funciona");
  const recoveryCookie = sessionCookie(recoveryLogin.response);

  const revokedOthers = await jsonRequest("/api/auth/sessions", "DELETE", { all_others: true }, recoveryCookie);
  check(revokedOthers.response.status === 200 && revokedOthers.body?.revoked_count >= 2, "Puede revocar las demás sesiones propias");

  const disabled = await jsonRequest("/api/auth/mfa", "DELETE", { password: temporaryPassword, code: totp(setup.body.secret) }, recoveryCookie);
  check(disabled.response.status === 200 && disabled.body?.enabled === false, "MFA puede desactivarse con reautenticación");
  temporaryMfaEnabled = false;

  const unsafeHeader = await jsonRequest("/api/v1/transactional/send", "POST", {
    to: { email: "header-check@example.test" }, subject: "Asunto correcto\r\nBcc: attacker@example.test", html: "<p>Prueba</p>",
  }, adminCookie, baseUrl, { "Idempotency-Key": `header-${runId}` });
  check(unsafeHeader.response.status === 422 && unsafeHeader.body?.error?.code === "validation_error", "Rechaza inyección CRLF en cabeceras");

  const reconcile = await jsonRequest("/api/v1/operations/actions", "POST", { action: "reconcile_blobs" }, adminCookie);
  check(reconcile.response.status === 200, "Reconciliación operativa ejecutable");

  const openapi = await request("/api/openapi");
  check(openapi.response.status === 200 && Object.keys(openapi.body?.paths ?? {}).length >= 77, "OpenAPI publica al menos 77 rutas");

  console.log(JSON.stringify({ ok: true, run_id: runId, checks: checks.length, temporary_user: temporaryUserId }, null, 2));
} finally {
  if (adminCookie && temporaryUserId) {
    const cleanup = await jsonRequest(`/api/users/${temporaryUserId}`, "PATCH", { status: "disabled" }, adminCookie).catch(() => null);
    if (!cleanup || cleanup.response.status !== 200) console.error(JSON.stringify({ level: "error", event: "e2e_cleanup_failed", user_id: temporaryUserId, mfa_enabled: temporaryMfaEnabled }));
  }
  if (adminCookie) {
    const logout = await jsonRequest("/api/auth/logout", "POST", {}, adminCookie).catch(() => null);
    if (!logout || logout.response.status !== 200) console.error(JSON.stringify({ level: "error", event: "e2e_admin_logout_failed" }));
  }
}
