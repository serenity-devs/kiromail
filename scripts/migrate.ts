import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";
import { env } from "../lib/config";

const sql = postgres(env.databaseUrl, { max: 1 });

try {
  await sql`CREATE TABLE IF NOT EXISTS schema_migrations (
    name text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`;

  const migrationDir = path.join(process.cwd(), "db", "migrations");
  const files = (await readdir(migrationDir)).filter((file) => file.endsWith(".sql")).sort();

  for (const file of files) {
    const [existing] = await sql<{ name: string }[]>`SELECT name FROM schema_migrations WHERE name = ${file}`;
    if (existing) continue;
    const migration = await readFile(path.join(migrationDir, file), "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(migration);
      await tx`INSERT INTO schema_migrations (name) VALUES (${file})`;
    });
    console.log(`Applied ${file}`);
  }
} finally {
  await sql.end();
}
