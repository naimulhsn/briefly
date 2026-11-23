import { db, client, vectorSupport } from "../db.js";
import {
  availableEmbedder,
  embedTexts,
  embedTextOf,
  vectorToJson,
  jsonToVector,
  EMBED_MODEL,
} from "../ai/embeddings.js";

export async function saveEmbedding(table, id, vec, model = EMBED_MODEL) {
  if (!vec?.length) return;
  const json = vectorToJson(vec);
  if (vectorSupport) {
    try {
      await client.execute({
        sql: `UPDATE ${table} SET embedding = vector32(?), embed_json = ?, embed_model = ? WHERE id = ?`,
        args: [json, json, model, id],
      });
      return;
    } catch {
      /* fall through to JSON-only */
    }
  }
  await db.prepare(`UPDATE ${table} SET embed_json = ?, embed_model = ? WHERE id = ?`).run(json, model, id);
}

export function parseStoredEmbedding(row) {
  if (!row) return null;
  if (Array.isArray(row.embedding)) return row.embedding;
  return jsonToVector(row.embed_json);
}

/**
 * Ensure every item has an in-memory embedding. Persists new ones.
 * `items` need id, title, and description/summary.
 */
export async function ensureEmbeddings(table, items, { log } = {}) {
  const embedder = availableEmbedder();
  if (embedder === "none" || !items.length) {
    const map = new Map();
    for (const it of items) {
      const v = parseStoredEmbedding(it);
      if (v) map.set(it.id, v);
    }
    return map;
  }
  const missing = [];
  const map = new Map();
  for (const it of items) {
    const existing = parseStoredEmbedding(it);
    const modelOk = !it.embed_model || it.embed_model === embedder || it.embed_model === EMBED_MODEL || String(it.embed_model).startsWith("gemini:");
    if (existing?.length && modelOk) map.set(it.id, existing);
    else missing.push(it);
  }
  if (missing.length && process.env.EMBED_SKIP_MISSING === "1") {
    log?.(`Skipping ${missing.length} unembedded ${table} (EMBED_SKIP_MISSING=1)`);
  } else if (missing.length) {
    log?.(`Embedding ${missing.length} ${table} with ${embedder}…`);
    const batch = Math.max(1, Math.min(40, Number(process.env.EMBEDDING_BATCH || 20)));
    try {
      for (let i = 0; i < missing.length; i += batch) {
        const slice = missing.slice(i, i + batch);
        const vecs = await embedTexts(slice.map((it) => embedTextOf(it)), { log });
        for (let j = 0; j < slice.length; j++) {
          const vec = vecs[j];
          if (!vec?.length) continue;
          map.set(slice[j].id, vec);
          await saveEmbedding(table, slice[j].id, vec, embedder);
        }
        log?.(`  embedded ${Math.min(i + slice.length, missing.length)}/${missing.length}`);
      }
    } catch (err) {
      log?.(`Embedding stopped early (${String(err.message || err).slice(0, 120)}); continuing with ${map.size} vectors`);
    }
  }
  return map;
}
