"use client";

const etags = new Map<string, string>();

function remember(value: unknown): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) remember(item);
    return;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.etag === "string") {
    const match = /^"([^:"]+):(.+):([1-9]\d*)"$/.exec(record.etag);
    if (match) etags.set(`${match[1]}:${match[2]}`, record.etag);
  }
  for (const nested of Object.values(record)) remember(nested);
}

function identityForUrl(url: string) {
  const path = new URL(url, "http://serenity.local").pathname;
  const patterns: [RegExp, (match: RegExpExecArray) => string][] = [
    [/^\/api\/v1\/lists\/([^/]+)\/fields\/([^/]+)$/, match => `list-field:${match[1]}/${match[2]}`],
    [/^\/api\/v1\/lists\/([^/]+)\/subscriptions\/([^/]+)$/, match => `subscription:${match[1]}/${match[2]}`],
    [/^\/api\/v1\/contacts\/([^/]+)$/, match => `contact:${match[1]}`],
    [/^\/api\/v1\/lists\/([^/]+)$/, match => `list:${match[1]}`],
    [/^\/api\/v1\/segments\/([^/]+)$/, match => `segment:${match[1]}`],
    [/^\/api\/v1\/templates\/([^/]+)$/, match => `template:${match[1]}`],
    [/^\/api\/v1\/assets\/([^/]+)$/, match => `asset:${match[1]}`],
    [/^\/api\/v1\/reusable-blocks\/([^/]+)$/, match => `reusable-block:${match[1]}`],
    [/^\/api\/v1\/webhooks\/([^/]+)$/, match => `webhook:${match[1]}`],
    [/^\/api\/v1\/suppressions\/([^/]+)$/, match => `suppression:${match[1]}`],
    [/^\/api\/v1\/campaigns\/([^/]+)$/, match => `campaign:${match[1]}`],
  ];
  for (const [pattern, build] of patterns) {
    const match = pattern.exec(path);
    if (match) return build(match);
  }
  return null;
}

export async function apiRequest<T = unknown>(url: string, options?: RequestInit): Promise<T> {
  const method = (options?.method ?? "GET").toUpperCase();
  const headers = new Headers(options?.headers);
  if (["PATCH", "PUT", "DELETE"].includes(method) && !headers.has("If-Match")) {
    const identity = identityForUrl(url);
    const etag = identity ? etags.get(identity) : undefined;
    if (etag) headers.set("If-Match", etag);
  }
  const response = await fetch(url, { ...options, headers });
  const body = await response.json().catch(() => ({}));
  if (response.status === 401) throw new Error("Sesión caducada");
  if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : body.error?.message ?? "No se ha podido completar la operación");
  remember(body);
  return body as T;
}
