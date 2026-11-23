import { db, nowIso } from "../db.js";
import { saveEmbedding } from "./vectors.js";

const articlesOf = db.prepare(
  "SELECT article_id FROM story_articles WHERE story_id = ?"
);

export async function mergeStoryIds(canonicalId, otherIds, { embedding } = {}) {
  const others = [...new Set(otherIds)].filter((id) => id && id !== canonicalId);
  if (!others.length) return canonicalId;
  for (const fromId of others) {
    await db
      .prepare(
        "INSERT OR IGNORE INTO story_articles (story_id, article_id) SELECT ?, article_id FROM story_articles WHERE story_id = ?"
      )
      .run(canonicalId, fromId);
    await db.prepare("DELETE FROM story_articles WHERE story_id = ?").run(fromId);
    await db
      .prepare(
        "INSERT OR IGNORE INTO bookmarks (user_id, story_id, created_at) SELECT user_id, ?, created_at FROM bookmarks WHERE story_id = ?"
      )
      .run(canonicalId, fromId);
    await db.prepare("DELETE FROM bookmarks WHERE story_id = ?").run(fromId);
    await db
      .prepare(
        "INSERT OR IGNORE INTO story_parties (story_id, party_name, role) SELECT ?, party_name, role FROM story_parties WHERE story_id = ?"
      )
      .run(canonicalId, fromId);
    await db.prepare("DELETE FROM story_parties WHERE story_id = ?").run(fromId);
    await db.prepare("DELETE FROM stories WHERE id = ?").run(fromId);
  }
  const countRow = await db
    .prepare("SELECT COUNT(*) AS n FROM story_articles WHERE story_id = ?")
    .get(canonicalId);
  await db
    .prepare("UPDATE stories SET article_count = ?, updated_at = ? WHERE id = ?")
    .run(countRow?.n || 1, nowIso(), canonicalId);
  if (embedding) await saveEmbedding("stories", canonicalId, embedding);
  return canonicalId;
}

export function pickCanonicalStory(rows) {
  if (!rows?.length) return null;
  const scored = rows.map((r) => {
    const gemini = String(r.processor || "").startsWith("gemini") ? 50 : 0;
    const summary = String(r.summary || "").length > 80 ? 20 : 0;
    const arts = Number(r.article_count || 0);
    return { r, score: gemini + summary + arts * 3 };
  });
  scored.sort((a, b) => b.score - a.score || a.r.id - b.r.id);
  return scored[0].r;
}

export async function storiesForArticles(articleIds) {
  if (!articleIds.length) return [];
  const placeholders = articleIds.map(() => "?").join(",");
  return db
    .prepare(
      `SELECT s.* FROM stories s
       JOIN story_articles sa ON sa.story_id = s.id
       WHERE sa.article_id IN (${placeholders})
       GROUP BY s.id`
    )
    .all(...articleIds);
}

export { articlesOf };
