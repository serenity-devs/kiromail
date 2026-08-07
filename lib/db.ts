import postgres from "postgres";
import { env } from "./config";

const databaseUrl = env.databaseUrl;

const globalForDb = globalThis as unknown as { serenitySql?: ReturnType<typeof postgres> };

export const sql = globalForDb.serenitySql ?? postgres(databaseUrl, {
  max: Number(process.env.DB_POOL_SIZE ?? 10),
  idle_timeout: 20,
  connect_timeout: 10,
  transform: { undefined: null },
});

if (process.env.NODE_ENV !== "production") globalForDb.serenitySql = sql;
