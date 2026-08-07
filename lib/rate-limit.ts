import { createHash } from "node:crypto";
import IORedis from "ioredis";
import { env } from "./config";

const globalRateLimit = globalThis as unknown as { serenityRateLimitRedis?: IORedis };
const redis = globalRateLimit.serenityRateLimitRedis ?? new IORedis(env.redisUrl, {
  lazyConnect: true,
  enableOfflineQueue: false,
  maxRetriesPerRequest: 1,
  connectTimeout: 1_500,
});
if (process.env.NODE_ENV !== "production") globalRateLimit.serenityRateLimitRedis = redis;

export function opaqueRateLimitKey(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

export async function consumeRateLimit(bucket: string, limit: number, seconds = 60) {
  if (redis.status === "wait") await redis.connect();
  const key = `serenity:rate:${bucket}:${Math.floor(Date.now() / (seconds * 1000))}`;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, seconds + 1);
  const ttl = Math.max(1, await redis.ttl(key));
  return { allowed: count <= limit, limit, remaining: Math.max(0, limit - count), retryAfter: ttl };
}
