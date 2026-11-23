import { Router } from "express";
import { db, nowIso, parseJson } from "../db.js";
import { requireAuth } from "./auth.js";

export const accountRouter = Router();

async function readPrefs(userId) {
  const row = await db.prepare("SELECT * FROM user_preferences WHERE user_id = ?").get(userId);
  if (!row) {
    return {
      home_area: "Pagar, Tongi, Gazipur",
      categories: [],
      followed_parties: [],
      followed_sources: [],
      muted_topics: [],
    };
  }
  return {
    home_area: row.home_area,
    categories: parseJson(row.categories, []),
    followed_parties: parseJson(row.followed_parties, []),
    followed_sources: parseJson(row.followed_sources, []),
    muted_topics: parseJson(row.muted_topics, []),
  };
}

accountRouter.get("/prefs", requireAuth, async (req, res) => {
  res.json({ prefs: await readPrefs(req.session.userId) });
});

accountRouter.put("/prefs", requireAuth, async (req, res) => {
  const home_area = String(req.body?.home_area || "Pagar, Tongi, Gazipur").trim().slice(0, 200);
  const asList = (v) =>
    (Array.isArray(v) ? v : String(v || "").split(","))
      .map((x) => String(x).trim())
      .filter(Boolean)
      .slice(0, 40);
  const categories = asList(req.body?.categories);
  const followed_parties = asList(req.body?.followed_parties);
  const followed_sources = asList(req.body?.followed_sources);
  const muted_topics = asList(req.body?.muted_topics);
  await db.prepare(
    `INSERT INTO user_preferences (user_id, home_area, categories, followed_parties, followed_sources, muted_topics, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       home_area=excluded.home_area, categories=excluded.categories,
       followed_parties=excluded.followed_parties, followed_sources=excluded.followed_sources,
       muted_topics=excluded.muted_topics, updated_at=excluded.updated_at`
  ).run(
    req.session.userId,
    home_area || "Pagar, Tongi, Gazipur",
    JSON.stringify(categories),
    JSON.stringify(followed_parties),
    JSON.stringify(followed_sources),
    JSON.stringify(muted_topics),
    nowIso()
  );
  res.json({ prefs: await readPrefs(req.session.userId) });
});

accountRouter.get("/bookmarks", requireAuth, async (req, res) => {
  const rows = await db
    .prepare(
      `SELECT s.*, b.created_at AS bookmarked_at
       FROM bookmarks b JOIN stories s ON s.id = b.story_id
       WHERE b.user_id = ?
       ORDER BY b.created_at DESC`
    )
    .all(req.session.userId);
  res.json({ stories: await hydrateStories(rows, req.session.userId) });
});

accountRouter.post("/bookmarks/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const story = await db.prepare("SELECT id FROM stories WHERE id = ?").get(id);
  if (!story) return res.status(404).json({ error: "Story not found" });
  await db.prepare(
    "INSERT OR IGNORE INTO bookmarks (user_id, story_id, created_at) VALUES (?, ?, ?)"
  ).run(req.session.userId, id, nowIso());
  res.json({ ok: true, bookmarked: true });
});

accountRouter.delete("/bookmarks/:id", requireAuth, async (req, res) => {
  await db.prepare("DELETE FROM bookmarks WHERE user_id = ? AND story_id = ?").run(
    req.session.userId,
    Number(req.params.id)
  );
  res.json({ ok: true, bookmarked: false });
});

export async function hydrateStories(rows, userId) {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const placeholders = ids.map(() => "?").join(",");
  const articles = await db
    .prepare(
      `SELECT sa.story_id, a.id, a.title, a.url, a.published_at, s.name AS source_name, s.type AS source_type
       FROM story_articles sa
       JOIN articles a ON a.id = sa.article_id
       JOIN sources s ON s.id = a.source_id
       WHERE sa.story_id IN (${placeholders})
       ORDER BY a.published_at DESC`
    )
    .all(...ids);
  const parties = await db
    .prepare(
      `SELECT story_id, party_name, role FROM story_parties WHERE story_id IN (${placeholders})`
    )
    .all(...ids);
  const bookmarked = new Set();
  if (userId) {
    const b = await db
      .prepare(
        `SELECT story_id FROM bookmarks WHERE user_id = ? AND story_id IN (${placeholders})`
      )
      .all(userId, ...ids);
    b.forEach((x) => bookmarked.add(x.story_id));
  }
  const byStoryArt = new Map();
  for (const a of articles) {
    if (!byStoryArt.has(a.story_id)) byStoryArt.set(a.story_id, []);
    byStoryArt.get(a.story_id).push(a);
  }
  const byStoryParty = new Map();
  for (const p of parties) {
    if (!byStoryParty.has(p.story_id)) byStoryParty.set(p.story_id, []);
    byStoryParty.get(p.story_id).push({ name: p.party_name, role: p.role });
  }
  return rows.map((s) => ({
    id: s.id,
    title: s.title,
    summary: s.summary,
    key_facts: safeJson(s.key_facts, []),
    source_differences: s.source_differences,
    location_level: s.location_level,
    location_name: s.location_name,
    category: s.category,
    legal_label: s.legal_label,
    legal_note: s.legal_note,
    law_suggestion: s.law_suggestion,
    fact_checked: Boolean(s.fact_checked),
    fact_check_url: s.fact_check_url,
    fact_check_source: s.fact_check_source,
    published_at: s.published_at,
    updated_at: s.updated_at,
    geo_score: s.geo_score,
    article_count: s.article_count,
    processor: s.processor,
    sources: byStoryArt.get(s.id) || [],
    parties: byStoryParty.get(s.id) || [],
    bookmarked: bookmarked.has(s.id),
    bookmarked_at: s.bookmarked_at || null,
  }));
}

function safeJson(v, fb) {
  try {
    return v ? JSON.parse(v) : fb;
  } catch {
    return fb;
  }
}
