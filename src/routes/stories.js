import { Router } from "express";
import { db, parseJson } from "../db.js";
import { hydrateStories } from "./account.js";

export const storiesRouter = Router();

async function userPrefs(req) {
  if (!req.session?.userId) return null;
  const row = await db.prepare("SELECT * FROM user_preferences WHERE user_id = ?").get(req.session.userId);
  if (!row) return null;
  return {
    home_area: row.home_area,
    categories: parseJson(row.categories, []),
    followed_parties: parseJson(row.followed_parties, []),
    followed_sources: parseJson(row.followed_sources, []),
    muted_topics: parseJson(row.muted_topics, []),
  };
}

storiesRouter.get("/", async (req, res) => {
  const prefs = await userPrefs(req);
  const q = String(req.query.q || "").trim();
  const category = String(req.query.category || "").trim();
  const legal = String(req.query.legal || "").trim();
  const location = String(req.query.location || "").trim();
  const party = String(req.query.party || "").trim();
  const source = String(req.query.source || "").trim();
  const fact = req.query.fact_checked;
  const from = String(req.query.from || "").trim();
  const to = String(req.query.to || "").trim();
  const sort = String(req.query.sort || "priority");
  const limit = Math.min(Number(req.query.limit) || 40, 100);
  const offset = Math.max(Number(req.query.offset) || 0, 0);

  const where = [];
  const params = [];

  if (q) {
    where.push(
      `(s.title LIKE ? OR s.summary LIKE ? OR s.key_facts LIKE ? OR s.location_name LIKE ?
        OR EXISTS (SELECT 1 FROM story_articles sa JOIN articles a ON a.id = sa.article_id
                   WHERE sa.story_id = s.id AND (a.title LIKE ? OR a.description LIKE ?)))`
    );
    const like = `%${q}%`;
    params.push(like, like, like, like, like, like);
  }
  if (category) {
    where.push("s.category = ?");
    params.push(category);
  }
  if (legal) {
    where.push("s.legal_label = ?");
    params.push(legal);
  }
  if (location) {
    where.push("s.location_level = ?");
    params.push(location);
  }
  if (party) {
    where.push("EXISTS (SELECT 1 FROM story_parties p WHERE p.story_id = s.id AND p.party_name = ?)");
    params.push(party);
  }
  if (source) {
    where.push(
      `EXISTS (SELECT 1 FROM story_articles sa JOIN sources src ON src.id = (
         SELECT a.source_id FROM articles a WHERE a.id = sa.article_id
       ) WHERE sa.story_id = s.id AND src.name = ?)`
    );
    params.push(source);
  }
  if (fact === "1" || fact === "true") where.push("s.fact_checked = 1");
  if (from) {
    where.push("s.published_at >= ?");
    params.push(from);
  }
  if (to) {
    where.push("s.published_at <= ?");
    params.push(to.length <= 10 ? to + "T23:59:59.999Z" : to);
  }

  if (prefs?.muted_topics?.length) {
    for (const topic of prefs.muted_topics) {
      where.push("s.title NOT LIKE ? AND IFNULL(s.summary,'') NOT LIKE ? AND s.category != ?");
      const like = `%${topic}%`;
      params.push(like, like, topic.toLowerCase());
    }
  }

  const whereSql = where.length ? "WHERE " + where.join(" AND ") : "";
  let order = "s.geo_score DESC, s.published_at DESC";
  if (sort === "newest") order = "s.published_at DESC";
  if (sort === "oldest") order = "s.published_at ASC";
  if (sort === "sources") order = "s.article_count DESC, s.published_at DESC";

  const total = (await db.prepare(`SELECT COUNT(*) AS n FROM stories s ${whereSql}`).get(...params)).n;

  // Followed categories/parties/sources get a mild boost in SQL via a computed score.
  let boost = "0";
  const boostParams = [];
  if (prefs?.categories?.length) {
    boost += " + CASE WHEN s.category IN (" + prefs.categories.map(() => "?").join(",") + ") THEN 8 ELSE 0 END";
    boostParams.push(...prefs.categories);
  }
  if (prefs?.followed_parties?.length) {
    boost += ` + CASE WHEN EXISTS (SELECT 1 FROM story_parties p WHERE p.story_id = s.id AND p.party_name IN (${prefs.followed_parties.map(() => "?").join(",")})) THEN 10 ELSE 0 END`;
    boostParams.push(...prefs.followed_parties);
  }
  if (sort === "priority") {
    order = `(s.geo_score + ${boost}) DESC, s.published_at DESC`;
  } else {
    boostParams.length = 0;
  }

  const rows = await db
    .prepare(
      `SELECT s.* FROM stories s ${whereSql} ORDER BY ${order} LIMIT ? OFFSET ?`
    )
    .all(...params, ...boostParams, limit, offset);

  res.json({
    total,
    limit,
    offset,
    stories: await hydrateStories(rows, req.session?.userId),
  });
});

storiesRouter.get("/:id", async (req, res) => {
  const row = await db.prepare("SELECT * FROM stories WHERE id = ?").get(Number(req.params.id));
  if (!row) return res.status(404).json({ error: "Story not found" });
  const [story] = await hydrateStories([row], req.session?.userId);
  res.json({ story });
});
