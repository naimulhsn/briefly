import { Router } from "express";
import { db } from "../db.js";

export const statsRouter = Router();

function range(req) {
  const from = String(req.query.from || "").trim();
  const to = String(req.query.to || "").trim();
  const where = [];
  const params = [];
  if (from) {
    where.push("s.published_at >= ?");
    params.push(from);
  }
  if (to) {
    where.push("s.published_at <= ?");
    params.push(to.length <= 10 ? to + "T23:59:59.999Z" : to);
  }
  return { sql: where.length ? "WHERE " + where.join(" AND ") : "", params };
}

statsRouter.get("/", async (req, res) => {
  const { sql, params } = range(req);

  const byPartyRole = await db
    .prepare(
      `SELECT p.party_name AS party, p.role, COUNT(*) AS count
       FROM story_parties p
       JOIN stories s ON s.id = p.story_id
       ${sql}
       GROUP BY p.party_name, p.role
       ORDER BY count DESC`
    )
    .all(...params);

  const byCategory = await db
    .prepare(
      `SELECT s.category, COUNT(*) AS count FROM stories s ${sql}
       GROUP BY s.category ORDER BY count DESC`
    )
    .all(...params);

  const byLocation = await db
    .prepare(
      `SELECT s.location_level AS location, COUNT(*) AS count FROM stories s ${sql}
       GROUP BY s.location_level ORDER BY count DESC`
    )
    .all(...params);

  const byLegal = await db
    .prepare(
      `SELECT s.legal_label AS legal_label, COUNT(*) AS count FROM stories s ${sql}
       GROUP BY s.legal_label ORDER BY count DESC`
    )
    .all(...params);

  const byDay = await db
    .prepare(
      `SELECT substr(s.published_at, 1, 10) AS day, COUNT(*) AS count
       FROM stories s ${sql}
       GROUP BY day ORDER BY day ASC`
    )
    .all(...params);

  const factChecked = await db
    .prepare(
      `SELECT SUM(CASE WHEN s.fact_checked = 1 THEN 1 ELSE 0 END) AS checked,
              COUNT(*) AS total
       FROM stories s ${sql}`
    )
    .get(...params);

  const parties = [...new Set(byPartyRole.map((r) => r.party))];
  const matrix = parties.map((party) => {
    const roles = { alleged_perpetrator: 0, victim: 0, mentioned: 0 };
    for (const r of byPartyRole.filter((x) => x.party === party)) roles[r.role] = r.count;
    return { party, ...roles, total: roles.alleged_perpetrator + roles.victim + roles.mentioned };
  });

  res.json({
    by_party_role: byPartyRole,
    party_matrix: matrix,
    by_category: byCategory,
    by_location: byLocation,
    by_legal: byLegal,
    by_day: byDay,
    fact_checked: factChecked,
    disclaimer:
      "Party roles are extracted from published reports. 'Alleged perpetrator' and 'victim' are reported roles, not findings of fact or guilt.",
  });
});

statsRouter.get("/meta", async (req, res) => {
  const sources = await db
    .prepare(
      "SELECT name, type, location_level, language, via, homepage FROM sources WHERE active = 1 ORDER BY type, name"
    )
    .all();
  const parties = await db.prepare("SELECT DISTINCT party_name AS name FROM story_parties ORDER BY name").all();
  const latest = await db.prepare("SELECT * FROM ingestion_runs ORDER BY id DESC LIMIT 1").get();
  const counts = await db
    .prepare(
      "SELECT (SELECT COUNT(*) FROM stories) AS stories, (SELECT COUNT(*) FROM articles) AS articles"
    )
    .get();
  res.json({ sources, parties, latest_run: latest || null, counts });
});
