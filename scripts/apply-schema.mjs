// One-off: apply db/schema.sql to Postgres over a connection string.
// Usage: DATABASE_URL="postgresql://..." node scripts/apply-schema.mjs
import { readFileSync } from "fs";
import pg from "pg";

const sql = readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8");

// Prefer discrete fields (avoids URL-encoding issues with special chars in
// the password); fall back to DATABASE_URL.
const client = process.env.PGPASSWORD
  ? new pg.Client({
      host: process.env.PGHOST,
      port: Number(process.env.PGPORT || 5432),
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      database: process.env.PGDATABASE || "postgres",
      ssl: { rejectUnauthorized: false },
    })
  : new pg.Client({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    });

await client.connect();
console.log("Connected. Applying schema…");
await client.query(sql);
console.log("Schema applied successfully.");
await client.end();
