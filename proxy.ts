import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { env } from "./lib/config";
import { consumeRateLimit, opaqueRateLimitKey } from "./lib/rate-limit";

const unsafeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const requestIdPattern = /^[A-Za-z0-9._:-]{8,128}$/;
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' https: http: data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

function address(request: NextRequest) {
  if (!env.trustProxy) return "direct";
  const value = (request.headers.get("x-forwarded-for")?.split(",")[0] ?? request.headers.get("x-real-ip") ?? "unknown").trim();
  return /^[0-9a-f:.]{2,64}$/i.test(value) ? value : "unknown";
}

function securityHeaders(response: NextResponse, requestId: string, request: NextRequest) {
  response.headers.set("X-Request-Id", requestId);
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()");
  response.headers.set("X-Frame-Options", "DENY");
  if (!request.nextUrl.pathname.includes("/content")) response.headers.set("Content-Security-Policy", contentSecurityPolicy);
  if (request.headers.get("x-forwarded-proto") === "https" || request.nextUrl.protocol === "https:") {
    response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  return response;
}

function rejected(request: NextRequest, requestId: string, status: number, code: string, message: string, retryAfter?: number) {
  const response = NextResponse.json({ error: { code, message }, request_id: requestId }, { status });
  if (retryAfter) response.headers.set("Retry-After", String(retryAfter));
  return securityHeaders(response, requestId, request);
}

function csrfIsValid(request: NextRequest) {
  const site = request.headers.get("sec-fetch-site");
  if (site === "cross-site") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).origin === request.nextUrl.origin || new URL(origin).origin === new URL(env.appUrl).origin;
  } catch {
    return false;
  }
}

function limitFor(request: NextRequest) {
  const authorization = request.headers.get("authorization") ?? "";
  const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (bearer) return { key: `api:${opaqueRateLimitKey(bearer)}`, limit: env.apiRateLimitPerMinute };
  const pathname = request.nextUrl.pathname;
  if (pathname === "/api/events/ses") return { key: `sns:${address(request)}`, limit: Math.max(1_000, env.publicRateLimitPerMinute) };
  if (pathname.startsWith("/api/public/") || pathname.startsWith("/api/auth/") || pathname === "/api/unsubscribe") {
    return { key: `public:${address(request)}`, limit: env.publicRateLimitPerMinute };
  }
  if (request.cookies.has("serenity_session")) return { key: `session:${address(request)}`, limit: env.sessionRateLimitPerMinute };
  return { key: `anonymous:${address(request)}`, limit: env.publicRateLimitPerMinute };
}

export async function proxy(request: NextRequest) {
  const suppliedId = request.headers.get("x-request-id") ?? "";
  const requestId = requestIdPattern.test(suppliedId) ? suppliedId : randomUUID();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", requestId);

  if (request.nextUrl.pathname.startsWith("/api/") && unsafeMethods.has(request.method) && request.cookies.has("serenity_session") && !request.headers.has("authorization") && !csrfIsValid(request)) {
    return rejected(request, requestId, 403, "csrf_rejected", "La petición no procede del origen autorizado");
  }

  if (request.nextUrl.pathname.startsWith("/api/")) {
    const rate = limitFor(request);
    try {
      const result = await consumeRateLimit(rate.key, rate.limit);
      if (!result.allowed) return rejected(request, requestId, 429, "rate_limited", "Se ha superado el límite temporal de peticiones", result.retryAfter);
    } catch (error) {
      console.error(JSON.stringify({ level: "error", event: "rate_limit_unavailable", request_id: requestId, error: error instanceof Error ? error.message : "unknown" }));
    }
  }

  console.info(JSON.stringify({ level: "info", event: "http_request", request_id: requestId, method: request.method, path: request.nextUrl.pathname }));
  return securityHeaders(NextResponse.next({ request: { headers: requestHeaders } }), requestId, request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
