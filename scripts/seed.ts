import { readFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";
import { env } from "../lib/config";

if (!process.argv.includes("--allow-demo-data")) {
  throw new Error(
    "El seed de demostración exige --allow-demo-data y nunca debe ejecutarse durante el arranque de producción",
  );
}

const sql = postgres(env.databaseUrl, { max: 1 });

try {
  const seed = await readFile(path.join(process.cwd(), "db", "seed.sql"), "utf8");
  await sql.unsafe(seed);
  console.log("Demo data is ready");
} finally {
  await sql.end();
}
