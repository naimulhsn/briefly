/**
 * Multilingual embeddings for news clustering (Bangla + English).
 *
 * Primary: Gemini gemini-embedding-001 (100+ languages, free tier
 * ~100 RPM / 30k TPM / 1k RPD). Truncated 768-d vectors must be L2-normalised.
 * Optional fallbacks (keys via env): Jina, Cohere.
 * If no embedder is configured, callers fall back to title/entity heuristics.
 */
import { config } from "../config.js";

export const EMBED_DIM = Number(process.env.EMBEDDING_DIM || 768);
export const EMBED_MODEL = process.env.EMBEDDING_MODEL || "gemini-embedding-001";
const BATCH = Math.max(1, Math.min(100, Number(process.env.EMBEDDING_BATCH || 20)));

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export function l2normalize(values) {
  if (!values?.length) return values;
  let s = 0;
  for (const x of values) s += x * x;
  const n = Math.sqrt(s);
  if (!n) return values;
  return values.map((x) => x / n);
}

export function cosineSimilarity(a, b) {
  if (!a?.length || !b?.length || a.length !== b.length) return 0;
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

export function meanVector(vectors) {
  const usable = (vectors || []).filter((v) => v?.length);
  if (!usable.length) return null;
  const dim = usable[0].length;
  const acc = new Array(dim).fill(0);
  for (const v of usable) {
    if (v.length !== dim) continue;
    for (let i = 0; i < dim; i++) acc[i] += v[i];
  }
  return l2normalize(acc.map((x) => x / usable.length));
}

export function embedTextOf(item) {
  const title = String(item?.title || "").trim();
  const lede = String(item?.description || item?.summary || item?.lede || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
  return [title, lede].filter(Boolean).join("\n").slice(0, 400);
}

export function availableEmbedder() {
  if (config.geminiKey) return `gemini:${EMBED_MODEL}`;
  if (config.jinaKey) return "jina";
  if (config.cohereKey) return "cohere";
  return "none";
}

async function geminiBatch(texts, { model = EMBED_MODEL, dim = EMBED_DIM } = {}) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:batchEmbedContents`;
  const requests = texts.map((text) => ({
    model: `models/${model}`,
    content: { parts: [{ text: text || " " }] },
    outputDimensionality: dim,
    taskType: "SEMANTIC_SIMILARITY",
  }));
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": config.geminiKey,
    },
    body: JSON.stringify({ requests }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const err = new Error(`Gemini embed ${res.status}`);
    err.status = res.status;
    err.body = body.slice(0, 300);
    throw err;
  }
  const data = await res.json();
  const embeddings = (data.embeddings || []).map((e) => l2normalize(e.values || []));
  if (embeddings.length !== texts.length) {
    throw new Error(`Gemini embed count mismatch: ${embeddings.length} != ${texts.length}`);
  }
  return embeddings;
}

async function jinaBatch(texts) {
  const res = await fetch("https://api.jina.ai/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.jinaKey}`,
    },
    body: JSON.stringify({
      model: process.env.JINA_EMBED_MODEL || "jina-embeddings-v3",
      task: "text-matching",
      dimensions: EMBED_DIM,
      input: texts,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const err = new Error(`Jina embed ${res.status}`);
    err.status = res.status;
    err.body = body.slice(0, 300);
    throw err;
  }
  const data = await res.json();
  const byIndex = new Map((data.data || []).map((d) => [d.index, d.embedding]));
  return texts.map((_, i) => l2normalize(byIndex.get(i) || data.data?.[i]?.embedding || []));
}

async function cohereBatch(texts) {
  const res = await fetch("https://api.cohere.com/v2/embed", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.cohereKey}`,
    },
    body: JSON.stringify({
      model: process.env.COHERE_EMBED_MODEL || "embed-v4.0",
      input_type: "clustering",
      embedding_types: ["float"],
      output_dimension: EMBED_DIM,
      texts,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const err = new Error(`Cohere embed ${res.status}`);
    err.status = res.status;
    err.body = body.slice(0, 300);
    throw err;
  }
  const data = await res.json();
  const floats = data.embeddings?.float || data.embeddings || [];
  return floats.map((v) => l2normalize(v));
}

async function embedBatchOnce(texts) {
  if (config.geminiKey) return geminiBatch(texts);
  if (config.jinaKey) return jinaBatch(texts);
  if (config.cohereKey) return cohereBatch(texts);
  return null;
}

export async function embedTexts(texts, { log } = {}) {
  if (!texts.length) return [];
  if (availableEmbedder() === "none") return texts.map(() => null);
  const out = new Array(texts.length);
  for (let i = 0; i < texts.length; i += BATCH) {
    const slice = texts.slice(i, i + BATCH);
    let lastErr;
    for (let attempt = 0; attempt < 12; attempt++) {
      try {
        const vecs = await embedBatchOnce(slice);
        if (!vecs) return texts.map(() => null);
        for (let j = 0; j < slice.length; j++) out[i + j] = vecs[j];
        lastErr = null;
        break;
      } catch (err) {
        lastErr = err;
        if (err.status === 429 || err.status === 503) {
          const wait = Math.min(120000, 15000 * (attempt + 1));
          log?.(`embed rate-limited, retry in ${wait}ms`);
          await sleep(wait);
          continue;
        }
        throw err;
      }
    }
    if (lastErr) throw lastErr;
    if (i + BATCH < texts.length) await sleep(Number(process.env.EMBEDDING_PAUSE_MS || 2000));
  }
  return out;
}

export function vectorToJson(vec) {
  if (!vec?.length) return null;
  return JSON.stringify(vec.map((x) => Number(x.toFixed(6))));
}

export function jsonToVector(s) {
  if (!s) return null;
  if (Array.isArray(s)) return s;
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}
