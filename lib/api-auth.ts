import { createHash, randomBytes } from "node:crypto";
import { getCurrentSession, roleAllows } from "./auth";
import { sql } from "./db";

export type ApiPrincipal = {
  kind: "session" | "api_key";
  id: string;
  scopes: string[];
  role?: "admin" | "editor" | "analyst";
};

function hashSecret(secret: string) {
  return createHash("sha256").update(secret).digest("hex");
}

function scopeAllowed(scopes: string[], required: string) {
  if (scopes.includes("*" ) || scopes.includes(required)) return true;
  const namespace = required.split(":")[0];
  return scopes.includes(`${namespace}:*`);
}

export async function authenticateApiRequest(request: Request, requiredScope: string, allowSession = true): Promise<ApiPrincipal | null> {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (token) {
    const [key] = await sql<{ id: string; scopes: string[] }[]>`
      SELECT id, scopes FROM api_keys
      WHERE secret_hash=${hashSecret(token)} AND revoked_at IS NULL
        AND (expires_at IS NULL OR expires_at > now())
    `;
    if (!key || !scopeAllowed(key.scopes, requiredScope)) return null;
    await sql`UPDATE api_keys SET last_used_at=now() WHERE id=${key.id}`;
    return { kind: "api_key", id: key.id, scopes: key.scopes };
  }
  if (allowSession) {
    const session = await getCurrentSession();
    if (session && roleAllows(session.user.role, requiredScope)) return { kind: "session", id: session.user.id, scopes: [], role: session.user.role };
  }
  return null;
}

export async function createApiKey(input: { name: string; scopes: string[]; expiresAt?: Date | null }) {
  const prefix = randomBytes(6).toString("hex");
  const token = `km_live_${prefix}_${randomBytes(32).toString("base64url")}`;
  const [key] = await sql<{ id: string; name: string; prefix: string; scopes: string[]; expires_at: Date | null; created_at: Date }[]>`
    INSERT INTO api_keys (name, prefix, secret_hash, scopes, expires_at)
    VALUES (${input.name}, ${prefix}, ${hashSecret(token)}, ${input.scopes}, ${input.expiresAt ?? null})
    RETURNING id, name, prefix, scopes, expires_at, created_at
  `;
  return { ...key, token };
}
