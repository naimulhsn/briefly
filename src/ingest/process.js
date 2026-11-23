import { db, nowIso, parseJson } from "../db.js";
import { fetchAllFeeds, recentArticles, upsertSources } from "./fetch.js";
import { clusterArticles, factCheckLikelyMatch, similarity, EMBED_THRESHOLD } from "./cluster.js";
import { classifyLocation, geoScoreFor } from "./geo.js";
import { analyzeClusters, availableProcessor } from "../ai/index.js";
import { cosineSimilarity } from "../ai/embeddings.js";
import { ensureEmbeddings, saveEmbedding, parseStoredEmbedding } from "./vectors.js";
import { mergeStoryIds, pickCanonicalStory, storiesForArticles } from "./merge-stories.js";

let running = null;

const insertStory = db.prepare(`
  INSERT INTO stories (
    title, summary, key_facts, source_differences, location_level, location_name,
    category, legal_label, legal_note, law_suggestion, fact_checked, fact_check_url,
    fact_check_source, published_at, updated_at, geo_score, processor, cluster_key, article_count
  ) VALUES (
    @title, @summary, @key_facts, @source_differences, @location_level, @location_name,
    @category, @legal_label, @legal_note, @law_suggestion, @fact_checked, @fact_check_url,
    @fact_check_source, @published_at, @updated_at, @geo_score, @processor, @cluster_key, @article_count
  )
`);

const updateStory = db.prepare(`
  UPDATE stories SET
    title=@title, summary=@summary, key_facts=@key_facts, source_differences=@source_differences,
    location_level=@location_level, location_name=@location_name, category=@category,
    legal_label=@legal_label, legal_note=@legal_note, law_suggestion=@law_suggestion,
    fact_checked=@fact_checked, fact_check_url=@fact_check_url, fact_check_source=@fact_check_source,
    published_at=@published_at, updated_at=@updated_at, geo_score=@geo_score,
    processor=@processor, article_count=@article_count
  WHERE id=@id
`);

const linkArticle = db.prepare(
  "INSERT OR IGNORE INTO story_articles (story_id, article_id) VALUES (?, ?)"
);
const clearParties = db.prepare("DELETE FROM story_parties WHERE story_id = ?");
const insertParty = db.prepare(
  "INSERT OR IGNORE INTO story_parties (story_id, party_name, role) VALUES (?, ?, ?)"
);

const existingStoryForArticle = db.prepare(`
  SELECT sa.story_id FROM story_articles sa WHERE sa.article_id = ?
`);

function clusterKey(cluster) {
  const ids = cluster.articles.map((a) => a.id).sort((a, b) => a - b);
  return ids.slice(0, 8).join("-");
}

function attachFactChecks(clusters) {
  const fact = [];
  const news = [];
  for (const c of clusters) {
    const isFc = c.articles.every((a) => a.source_type === "factcheck") ||
      (c.articles.some((a) => a.source_type === "factcheck") && c.articles.length <= 3);
    if (c.articles.some((a) => a.source_type === "factcheck") &&
        c.articles.filter((a) => a.source_type !== "factcheck").length === 0) {
      fact.push(c);
    } else {
      news.push(c);
    }
  }
  // Try to pin fact-checks onto matching news clusters; leftover fact-checks stay as stories.
  const leftover = [];
  for (const fc of fact) {
    let best = null;
    let bestScore = 0;
    for (const n of news) {
      const score = similarity(fc, n);
      if (score > bestScore) {
        bestScore = score;
        best = n;
      }
    }
    if (best && factCheckLikelyMatch(fc.title, best.title)) {
      best.factCheck = {
        url: fc.articles[0].url,
        source: fc.articles[0].source_name,
        title: fc.title,
      };
      best.articles.push(...fc.articles);
    } else {
      leftover.push(fc);
    }
  }
  return [...news, ...leftover];
}

async function resolveExistingStory(cluster, { hours = 72 } = {}) {
  const existing = await storiesForArticles(cluster.articles.map((a) => a.id));
  if (existing.length) {
    const canon = pickCanonicalStory(existing);
    if (existing.length > 1) {
      await mergeStoryIds(canon.id, existing.map((s) => s.id), { embedding: cluster.embedding });
    }
    return canon.id;
  }
  if (cluster.embedding) {
    const since = new Date(Date.now() - hours * 3600 * 1000).toISOString();
    const stories = await db
      .prepare("SELECT id, title, processor, article_count, summary, embed_json, published_at FROM stories WHERE published_at >= ? OR updated_at >= ?")
      .all(since, since);
    let best = null;
    let bestCos = 0;
    for (const s of stories) {
      const vec = parseStoredEmbedding(s);
      if (!vec) continue;
      const cos = cosineSimilarity(cluster.embedding, vec);
      if (cos > bestCos) {
        bestCos = cos;
        best = s;
      }
    }
    if (best && bestCos >= EMBED_THRESHOLD) return best.id;
  }
  return null;
}

export function getRunning() {
  return running;
}

export async function runIngest({ hours = 72, homeArea = "Pagar, Tongi, Gazipur", log = console.log } = {}) {
  if (running) {
    return { ok: false, error: "An ingest is already running", id: running.id };
  }
  running = { id: null, started_at: new Date().toISOString(), status: "starting" };
  let runId = null;
  try {
    await upsertSources();
    const started = running.started_at;
    const info = await db
    .prepare(
      "INSERT INTO ingestion_runs (started_at, status, processor) VALUES (?, ?, ?)"
    )
    .run(started, "running", availableProcessor());
    runId = info.lastInsertRowid;
    running = { id: runId, started_at: started, status: "running" };
    log("Fetching feeds…");
    const fetched = await fetchAllFeeds((p) => {
      if (p.ok) log(`  ✓ ${p.source} (${p.count})`);
      else log(`  ✗ ${p.source}`);
    });

    if (process.env.REBUILD_STORIES === "1") {
      log("Rebuilding story table from stored articles…");
      await db.exec("DELETE FROM story_parties; DELETE FROM story_articles; DELETE FROM bookmarks; DELETE FROM stories;");
    }

    log("Clustering recent articles…");
    const articles = await recentArticles(hours);
    const embeddings = await ensureEmbeddings("articles", articles, { log });
    let clusters = await clusterArticles(articles, { hours, embeddings, log });
    clusters = attachFactChecks(clusters);
    for (const c of clusters) {
      const blob = c.articles.map((a) => `${a.title}\n${a.description || ""}`).join("\n");
      const loc = classifyLocation(
        `${c.title}\n${blob}`,
        c.articles[0]?.source_level,
        homeArea
      );
      c.location_level = loc.level;
      c.location_name = loc.name;
    }
    const rank = (c) => {
      const level = { local_area: 400, city: 300, country: 80, world: 10 }[c.location_level] || 0;
      const fc = c.articles.some((a) => a.source_type === "factcheck") || c.factCheck ? 60 : 0;
      const multi = Math.min(c.articles.length, 12) * 8;
      const recency = Date.parse(c.published_at || 0) / 1e12;
      return level + fc + multi + recency;
    };
    clusters.sort((a, b) => rank(b) - rank(a));

    log(`Analyzing ${clusters.length} clusters with ${availableProcessor()}…`);
    const { results, processor, aiCount } = await analyzeClusters(clusters, {
      homeArea,
      onBatch: (b) =>
        log(
          `  AI batch ${Math.min(b.done, b.total)}/${b.total}${b.error ? " (fallback: " + b.error + ")" : ""}`
        ),
    });

    let created = 0;
    let updated = 0;
    // Write stories statement-by-statement. A single Turso interactive
    // transaction over hundreds of round trips is rolled back when the
    // stream sits idle (SQLITE_BUSY: interactive transaction was rolled
    // back because the stream was idle for too long).
    for (const [i, cluster] of clusters.entries()) {
        const ai = results[i];
        const blob = cluster.articles.map((a) => `${a.title}\n${a.description || ""}`).join("\n");
        const loc =
          ai.location_level && ai.location_name
            ? { level: ai.location_level, name: ai.location_name }
            : classifyLocation(`${cluster.title}\n${blob}`, cluster.articles[0]?.source_level, homeArea);
        const fact = cluster.factCheck ||
          (ai.is_fact_check
            ? {
                url: cluster.articles.find((a) => a.source_type === "factcheck")?.url,
                source: cluster.articles.find((a) => a.source_type === "factcheck")?.source_name,
              }
            : null);
        const published = cluster.articles
          .map((a) => a.published_at)
          .filter(Boolean)
          .sort()
          .at(-1) || nowIso();

        const row = {
          title: ai.title,
          summary: ai.summary,
          key_facts: JSON.stringify(ai.key_facts || []),
          source_differences: ai.source_differences || "",
          location_level: loc.level,
          location_name: loc.name,
          category: ai.category || "other",
          legal_label: ai.legal_label || "other",
          legal_note: ai.legal_note || null,
          law_suggestion: ai.law_suggestion || null,
          fact_checked: fact ? 1 : 0,
          fact_check_url: fact?.url || null,
          fact_check_source: fact?.source || null,
          published_at: published,
          updated_at: nowIso(),
          geo_score: geoScoreFor(loc.level),
          processor: ai.processor || processor,
          cluster_key: clusterKey(cluster),
          article_count: cluster.articles.length,
        };

        const existingId = await resolveExistingStory(cluster, { hours });
        let storyId;
        if (existingId) {
          await updateStory.run({ ...row, id: existingId });
          storyId = existingId;
          updated += 1;
        } else {
          const res = await insertStory.run(row);
          storyId = res.lastInsertRowid;
          created += 1;
        }
        for (const a of cluster.articles) await linkArticle.run(storyId, a.id);
        if (cluster.embedding) await saveEmbedding("stories", storyId, cluster.embedding);
        await clearParties.run(storyId);
        for (const p of ai.parties || []) {
          await insertParty.run(storyId, p.name, p.role);
        }
      }

    const finished = nowIso();
    await db.prepare(
      `UPDATE ingestion_runs SET
        finished_at=?, status=?, feeds_ok=?, feeds_failed=?, articles_fetched=?,
        articles_new=?, clusters_created=?, clusters_updated=?, ai_processed=?,
        processor=?, source_report=?
      WHERE id=?`
    ).run(
      finished,
      "ok",
      fetched.feedsOk,
      fetched.feedsFailed,
      fetched.articlesFetched,
      fetched.articlesNew,
      created,
      updated,
      aiCount,
      processor,
      JSON.stringify(fetched.report),
      runId
    );
    const summary = {
      ok: true,
      id: runId,
      feedsOk: fetched.feedsOk,
      feedsFailed: fetched.feedsFailed,
      articlesFetched: fetched.articlesFetched,
      articlesNew: fetched.articlesNew,
      clustersCreated: created,
      clustersUpdated: updated,
      aiProcessed: aiCount,
      processor,
      report: fetched.report,
      started,
      finished,
    };
    running = null;
    log("Ingest complete.", `${created} new stories, ${updated} updated, AI=${aiCount} (${processor})`);
    return summary;
  } catch (err) {
    if (runId) {
      await db.prepare(
        "UPDATE ingestion_runs SET finished_at=?, status=?, error=? WHERE id=?"
      ).run(nowIso(), "error", String(err.stack || err).slice(0, 2000), runId);
    }
    running = null;
    throw err;
  }
}


export async function reclusterArchive({
  hours = 72,
  lookbackHours = 720,
  log = console.log,
} = {}) {
  if (running) {
    return { ok: false, error: "An ingest is already running", id: running.id };
  }
  running = { id: null, started_at: new Date().toISOString(), status: "reclustering" };
  try {
    const before = await db.prepare("SELECT COUNT(*) AS n FROM stories").get();
    log(`Reclustering archive (${before?.n || 0} stories)…`);
    const articles = await recentArticles(lookbackHours, { cap: 0 });
    log(`  ${articles.length} articles in lookback window`);
    const embeddings = await ensureEmbeddings("articles", articles, { log });
    const clusters = await clusterArticles(articles, { hours, embeddings, log });
    log(`  ${clusters.length} event clusters`);
    let merged = 0;
    let touched = 0;
    let created = 0;
    const examples = [];
    for (const cluster of clusters) {
      const existing = await storiesForArticles(cluster.articles.map((a) => a.id));
      if (existing.length) {
        const canon = pickCanonicalStory(existing);
        if (existing.length > 1) {
          const dropped = existing.filter((s) => s.id !== canon.id);
          await mergeStoryIds(canon.id, dropped.map((s) => s.id), { embedding: cluster.embedding });
          merged += dropped.length;
          examples.push({
            kept: canon.title,
            dropped: dropped.map((s) => s.title),
            articles: cluster.articles.length,
          });
        }
        for (const a of cluster.articles) await linkArticle.run(canon.id, a.id);
        const countRow = await db
          .prepare("SELECT COUNT(*) AS n FROM story_articles WHERE story_id = ?")
          .get(canon.id);
        await db
          .prepare("UPDATE stories SET article_count = ?, updated_at = ? WHERE id = ?")
          .run(countRow?.n || cluster.articles.length, nowIso(), canon.id);
        if (cluster.embedding) await saveEmbedding("stories", canon.id, cluster.embedding);
        touched += 1;
      } else {
        const loc = classifyLocation(
          cluster.articles.map((a) => `${a.title}\n${a.description || ""}`).join("\n"),
          cluster.articles[0]?.source_level
        );
        const published =
          cluster.articles.map((a) => a.published_at).filter(Boolean).sort().at(-1) || nowIso();
        const res = await insertStory.run({
          title: cluster.title.slice(0, 240),
          summary: "",
          key_facts: "[]",
          source_differences: "",
          location_level: loc.level,
          location_name: loc.name,
          category: "other",
          legal_label: "other",
          legal_note: null,
          law_suggestion: null,
          fact_checked: 0,
          fact_check_url: null,
          fact_check_source: null,
          published_at: published,
          updated_at: nowIso(),
          geo_score: geoScoreFor(loc.level),
          processor: "recluster",
          cluster_key: clusterKey(cluster),
          article_count: cluster.articles.length,
        });
        const storyId = res.lastInsertRowid;
        for (const a of cluster.articles) await linkArticle.run(storyId, a.id);
        if (cluster.embedding) await saveEmbedding("stories", storyId, cluster.embedding);
        created += 1;
      }
    }
    await db.prepare(
      "DELETE FROM story_parties WHERE story_id NOT IN (SELECT id FROM stories)"
    ).run();
    await db.prepare(
      "DELETE FROM bookmarks WHERE story_id NOT IN (SELECT id FROM stories)"
    ).run();
    const after = await db.prepare("SELECT COUNT(*) AS n FROM stories").get();
    const summary = {
      ok: true,
      before: before?.n || 0,
      after: after?.n || 0,
      merged,
      touched,
      created,
      clusters: clusters.length,
      articles: articles.length,
      examples: examples.slice(0, 15),
    };
    running = null;
    log(
      `Recluster complete. stories ${summary.before} → ${summary.after} (merged ${merged} duplicates, created ${created})`
    );
    return summary;
  } catch (err) {
    running = null;
    throw err;
  }
}

export async function latestRun() {
  const row = await db.prepare("SELECT * FROM ingestion_runs ORDER BY id DESC LIMIT 1").get();
  if (!row) return null;
  return { ...row, source_report: parseJson(row.source_report, []) };
}
