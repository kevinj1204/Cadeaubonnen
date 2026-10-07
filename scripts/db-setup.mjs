// Maakt (of werkt bij) alle tabellen in de database.
// Gebruik:  DATABASE_URL="postgres://..." npm run db:setup
// Of zet DATABASE_URL in een bestand .env.local in de projectmap.
import { readFileSync, existsSync } from "node:fs";
import pg from "pg";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*"?(.*?)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("✗ DATABASE_URL ontbreekt. Zet hem in .env.local of geef hem mee op de opdrachtregel.");
  process.exit(1);
}
const client = new pg.Client({
  connectionString: url,
  ssl: /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: false },
});
await client.connect();
const sql = readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8");
await client.query(sql);
const { rows } = await client.query(
  "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name",
);
console.log("✓ Database klaar. Tabellen:", rows.map((r) => r.table_name).join(", "));
await client.end();
