/**
 * Copy the local SQLite file into a Turso/libSQL database.
 * Usage:
 *   TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... node scripts/migrate-to-turso.js
 * Never pass the token on the command line if it would appear in shell history;
 * export it from a file instead.
 */
import { createClient } from "@libsql/client";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const localPath = process.env.DATABASE_PATH || path.join(ROOT, "data", "briefly.db");
const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;
if (!url || !authToken) {
  console.error("Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN first.");
  process.exit(1);
}
if (!fs.existsSync(localPath)) {
  console.error("Local database not found at", localPath);
  process.exit(1);
}

const TABLES = [
  "users",
  "user_preferences",
  "sources",
  "articles",
  "stories",
  "story_articles",
  "story_parties",
  "bookmarks",
  "ingestion_runs",
];

const src = createClient({ url: localPath.startsWith("file:") ? localPath : `file:${localPath}` });
const dest = createClient({ url, authToken });

// Apply schema from the running app's init (idempotent).
const { initDb, db, client } = await import("../src/db.js");
await initDb();
// initDb applied to dest because TURSO_* is set in this process.
console.log("Schema applied on Turso.");

const BATCH = 80;
for (const table of TABLES) {
  const countRs = await src.execute(`SELECT COUNT(*) AS n FROM ${table}`);
  const total = Number(countRs.rows[0].n);
  const infoRs = await src.execute(`PRAGMA table_info(${table})`);
  const cols = infoRs.rows.map((r) => r.name);
  const placeholders = cols.map(() => "?").join(", ");
  const insert = `INSERT OR REPLACE INTO ${table} (${cols.join(", ")}) VALUES (${placeholders})`;
  let offset = 0;
  let copied = 0;
  while (offset < total) {
    const rs = await src.execute(`SELECT * FROM ${table} LIMIT ${BATCH} OFFSET ${offset}`);
    if (!rs.rows.length) break;
    const tx = await dest.transaction("write");
    try {
      for (const row of rs.rows) {
        const args = cols.map((c) => row[c]);
        await tx.execute({ sql: insert, args });
        copied += 1;
      }
      await tx.commit();
    } catch (err) {
      try { await tx.rollback(); } catch { /* ignore */ }
      throw err;
    }
    offset += rs.rows.length;
  }
  console.log(`  ${table}: ${copied}/${total}`);
}

src.close();
dest.close();
client.close?.();
db.close();
console.log("Migration complete.");
