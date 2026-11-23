/**
 * Re-cluster stored articles with embeddings and merge duplicate stories.
 * Usage: node scripts/recluster-archive.js
 * Optional: LOOKBACK_HOURS=240 CLUSTER_HOURS=72 DATABASE_PATH=...
 */
import { initDb, db } from "../src/db.js";
import { reclusterArchive } from "../src/ingest/process.js";

await initDb();
const beforeStories = await db.prepare("SELECT COUNT(*) AS n FROM stories").get();
const beforeArts = await db.prepare("SELECT COUNT(*) AS n FROM articles").get();
console.log(`Starting recluster: ${beforeArts?.n} articles, ${beforeStories?.n} stories`);
const result = await reclusterArchive({
  hours: Number(process.env.CLUSTER_HOURS || 72),
  lookbackHours: Number(process.env.LOOKBACK_HOURS || 240),
  log: (...a) => console.log(...a),
});
if (result.examples?.length) {
  console.log("Example merges:");
  for (const ex of result.examples) {
    console.log(`  KEEP: ${ex.kept}`);
    for (const d of ex.dropped) console.log(`    ↳ merged: ${d}`);
  }
}
console.log(JSON.stringify({ ok: result.ok, before: result.before, after: result.after, merged: result.merged, created: result.created, clusters: result.clusters, articles: result.articles }, null, 2));
db.close();
