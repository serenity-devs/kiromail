import postgres from "postgres";
import { env } from "../lib/config";
import { hashPassword } from "../lib/passwords";

const sql = postgres(env.databaseUrl, { max: 1 });

try {
  const [{ count }] = await sql<{ count: number }[]>`
    SELECT count(*)::int AS count FROM users
  `;

  if (count === 0) {
    const email = env.adminEmail.trim().toLowerCase();
    const passwordHash = await hashPassword(env.adminPassword);
    await sql`
      INSERT INTO users(email,name,password_hash,role,status)
      VALUES(${email},'Serenity',${passwordHash},'admin','active')
      ON CONFLICT(lower(email)) DO NOTHING
    `;
    console.log("Initial administrator is ready");
  } else {
    console.log("Administrator bootstrap skipped: users already exist");
  }
} finally {
  await sql.end();
}
