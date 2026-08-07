import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { env } from "./config";
import { sql } from "./db";
import { decryptTotpSecret, matchRecoveryCode, verifyTotp } from "./mfa";
import { hashPassword, verifyPassword } from "./passwords";

const COOKIE_NAME = "serenity_session";
const sessionDays = 7;

export type UserRole = "admin" | "editor" | "analyst";
export type SessionUser = { id: string; email: string; name: string; role: UserRole; require_password_change: boolean; mfa_enabled: boolean };
export type CurrentSession = { id: string; expires_at: Date; created_at: Date; last_used_at: Date; user_agent: string; ip: string | null; label: string; user: SessionUser };

const roleScopes: Record<UserRole, string[]> = {
  admin: ["*"],
  editor: ["lists:read", "lists:write", "contacts:read", "contacts:write", "templates:read", "templates:write", "campaigns:read", "campaigns:write", "campaigns:send", "transactional:read", "reports:read"],
  analyst: ["campaigns:read", "transactional:read", "reports:read"],
};

function sign(value: string) {
  return createHmac("sha256", env.sessionSecret).update(value).digest("base64url");
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function identityHash(email: string) {
  return createHmac("sha256", env.sessionSecret).update(email.trim().toLowerCase()).digest("hex");
}

export function clientAddress(request: Request) {
  if (!env.trustProxy) return null;
  const value = (request.headers.get("x-forwarded-for")?.split(",")[0] ?? request.headers.get("x-real-ip") ?? "").trim();
  return /^[0-9a-f:.]{2,64}$/i.test(value) ? value : null;
}

export function roleAllows(role: UserRole, requiredScope: string) {
  const scopes = roleScopes[role];
  return scopes.includes("*") || scopes.includes(requiredScope) || scopes.includes(`${requiredScope.split(":")[0]}:*`);
}

async function storeSessionCookie(token: string) {
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.appUrl.startsWith("https://"),
    path: "/",
    maxAge: 60 * 60 * 24 * sessionDays,
  });
}

async function recordAttempt(emailHash: string, ip: string | null, success: boolean) {
  await sql`INSERT INTO auth_attempts(email_hash,ip,success) VALUES(${emailHash},${ip}::inet,${success})`;
}

export async function authenticateCredentials(request: Request, emailInput: string, password: string, mfaCode = "") {
  const email = emailInput.trim().toLowerCase();
  const emailHash = identityHash(email);
  const ip = clientAddress(request);
  const [{ failures }] = await sql<{ failures: number }[]>`
    SELECT count(*)::int AS failures FROM auth_attempts
    WHERE success=false AND attempted_at > now() - interval '15 minutes'
      AND (email_hash=${emailHash} OR (${ip}::inet IS NOT NULL AND ip=${ip}::inet))
  `;
  if (failures >= 5) return { ok: false as const, code: "rate_limited", message: "Demasiados intentos. Espera 15 minutos antes de volver a probar.", retryAfter: 900 };

  const [user] = await sql<(SessionUser & { password_hash: string; status: string; mfa_secret_encrypted: string | null; mfa_recovery_codes: string[] })[]>`
    SELECT id,email,name,role,require_password_change,password_hash,status,mfa_enabled,mfa_secret_encrypted,mfa_recovery_codes FROM users WHERE lower(email)=${email}
  `;
  const passwordMatches = await verifyPassword(password, user?.password_hash ?? "");
  if (!user || user.status !== "active" || !passwordMatches) {
    await recordAttempt(emailHash, ip, false);
    return { ok: false as const, code: "invalid_credentials", message: "El correo o la contraseña no son correctos" };
  }

  if (user.mfa_enabled) {
    if (!mfaCode.trim()) return { ok: false as const, code: "mfa_required", message: "Introduce el código de tu aplicación de autenticación", mfaRequired: true };
    let valid = false;
    let recoveryIndex = -1;
    try {
      valid = Boolean(user.mfa_secret_encrypted && verifyTotp(decryptTotpSecret(user.mfa_secret_encrypted), mfaCode));
      if (!valid) recoveryIndex = matchRecoveryCode(user.mfa_recovery_codes ?? [], mfaCode);
    } catch {
      valid = false;
    }
    if (!valid && recoveryIndex < 0) {
      await recordAttempt(emailHash, ip, false);
      return { ok: false as const, code: "invalid_mfa", message: "El código de verificación no es válido" };
    }
    if (recoveryIndex >= 0) {
      const remaining = [...(user.mfa_recovery_codes ?? [])];
      remaining.splice(recoveryIndex, 1);
      await sql`UPDATE users SET mfa_recovery_codes=${sql.json(remaining)},updated_at=now() WHERE id=${user.id}`;
      await sql`INSERT INTO audit_log(action,entity_type,entity_id,user_id,detail) VALUES('mfa_recovery_used','user',${user.id},${user.id},${sql.json({remaining:remaining.length})})`;
    }
  }

  const token = randomBytes(32).toString("base64url");
  const userAgent = request.headers.get("user-agent")?.slice(0, 1000) ?? "";
  const label = userAgent.includes("Mobile") ? "Navegador móvil" : "Navegador web";
  const [session] = await sql<{ id: string; expires_at: Date }[]>`
    INSERT INTO user_sessions(user_id,token_hash,ip,user_agent,label,expires_at)
    VALUES(${user.id},${hashToken(token)},${ip}::inet,${userAgent},${label},now() + interval '7 days') RETURNING id,expires_at
  `;
  await sql`UPDATE users SET last_login_at=now(),updated_at=now() WHERE id=${user.id}`;
  await recordAttempt(emailHash, ip, true);
  await sql`DELETE FROM auth_attempts WHERE attempted_at < now() - interval '30 days'`;
  await storeSessionCookie(token);
  return { ok: true as const, user: { id: user.id, email: user.email, name: user.name, role: user.role, require_password_change: user.require_password_change, mfa_enabled: user.mfa_enabled }, session };
}

export async function getCurrentSession(): Promise<CurrentSession | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const [row] = await sql<{
    id: string; expires_at: Date; created_at: Date; last_used_at: Date; user_agent: string; ip: string | null; label: string;
    user_id: string; email: string; name: string; role: UserRole; require_password_change: boolean; mfa_enabled: boolean;
  }[]>`
    SELECT s.id,s.expires_at,s.created_at,s.last_used_at,s.user_agent,s.ip::text,s.label,
      u.id AS user_id,u.email,u.name,u.role,u.require_password_change,u.mfa_enabled
    FROM user_sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=${hashToken(token)} AND s.revoked_at IS NULL AND s.expires_at>now() AND u.status='active'
  `;
  if (!row) return null;
  if (Date.now() - new Date(row.last_used_at).getTime() > 60_000) await sql`UPDATE user_sessions SET last_used_at=now() WHERE id=${row.id}`;
  return { id: row.id, expires_at: row.expires_at, created_at: row.created_at, last_used_at: row.last_used_at, user_agent: row.user_agent, ip: row.ip, label: row.label, user: { id: row.user_id, email: row.email, name: row.name, role: row.role, require_password_change: row.require_password_change, mfa_enabled: row.mfa_enabled } };
}

export async function hasSession(requiredScope?: string) {
  const session = await getCurrentSession();
  return Boolean(session && (!requiredScope || roleAllows(session.user.role, requiredScope)));
}

export async function revokeCurrentSession() {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (token) await sql`UPDATE user_sessions SET revoked_at=COALESCE(revoked_at,now()) WHERE token_hash=${hashToken(token)}`;
  store.delete(COOKIE_NAME);
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export async function issuePasswordReset(emailInput: string) {
  const email = emailInput.trim().toLowerCase();
  const [user] = await sql<{ id: string; email: string; name: string }[]>`SELECT id,email,name FROM users WHERE lower(email)=${email} AND status='active'`;
  if (!user) return null;
  const token = randomBytes(32).toString("base64url");
  await sql`UPDATE password_reset_tokens SET used_at=COALESCE(used_at,now()) WHERE user_id=${user.id} AND used_at IS NULL`;
  const [reset] = await sql<{ id: string; expires_at: Date }[]>`INSERT INTO password_reset_tokens(user_id,token_hash,expires_at) VALUES(${user.id},${hashToken(token)},now()+interval '1 hour') RETURNING id,expires_at`;
  return { ...reset, token, user };
}

export async function resetPassword(token: string, password: string) {
  const passwordHash = await hashPassword(password);
  return sql.begin(async tx => {
    const [reset] = await tx<{ id: string; user_id: string }[]>`SELECT id,user_id FROM password_reset_tokens WHERE token_hash=${hashToken(token)} AND used_at IS NULL AND expires_at>now() FOR UPDATE`;
    if (!reset) return false;
    await tx`UPDATE users SET password_hash=${passwordHash},password_changed_at=now(),require_password_change=false,updated_at=now() WHERE id=${reset.user_id}`;
    await tx`UPDATE password_reset_tokens SET used_at=now() WHERE id=${reset.id}`;
    await tx`UPDATE user_sessions SET revoked_at=COALESCE(revoked_at,now()) WHERE user_id=${reset.user_id} AND revoked_at IS NULL`;
    await tx`INSERT INTO audit_log(action,entity_type,entity_id,user_id,detail) VALUES('password_reset','user',${reset.user_id},${reset.user_id},'{}')`;
    return true;
  });
}

export function createUnsubscribeToken(email: string, campaignId: string) {
  const payload = Buffer.from(JSON.stringify({ email: email.toLowerCase(), campaignId })).toString("base64url");
  return `${payload}.${sign(`unsubscribe:${payload}`)}`;
}

export function readUnsubscribeToken(token: string) {
  const [payload, signature] = token.split(".");
  if (!payload || !signature || !safeEqual(signature, sign(`unsubscribe:${payload}`))) return null;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString()) as { email: string; campaignId: string };
  } catch {
    return null;
  }
}

export const sessionCookieName = COOKIE_NAME;
