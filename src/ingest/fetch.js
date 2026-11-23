import Parser from "rss-parser";
import * as cheerio from "cheerio";
import { SOURCE_CATALOG } from "./sources.js";
import { db, nowIso } from "../db.js";

const USER_AGENT =
  "BrieflyBD/1.0 (personalized news briefing; polite aggregator; contact: local-operator)";

const parser = new Parser({
  timeout: 15000,
  headers: { "User-Agent": USER_AGENT, Accept: "application/rss+xml, application/xml, text/xml, */*" },
  customFields: {
    item: [
      ["content:encoded", "contentEncoded"],
      ["dc:date", "dcDate"],
      ["source", "gSource", { keepArray: false }],
    ],
  },
});

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function stripHtml(html) {
  if (!html) return "";
  const $ = cheerio.load(html);
  $("script, style, iframe, noscript").remove();
  return $("body").text().replace(/\s+/g, " ").trim();
}

function itemText(value) {
  if (value == null) return "";
  if (typeof value === "string") return stripHtml(value).trim();
  if (Array.isArray(value)) return itemText(value.map(itemText).join(" "));
  if (typeof value === "object") {
    if (typeof value._ === "string") return itemText(value._);
    if (typeof value["#"] === "string") return itemText(value["#"]);
    if (typeof value.text === "string") return itemText(value.text);
    if (value.a) return itemText(value.a);
    const first = Object.values(value).find((v) => typeof v === "string" || typeof v === "object");
    if (first) return itemText(first);
  }
  return String(value).trim();
}


function unwrapGoogleNews(item) {
  // Prefer the original outlet URL when the description contains one.
  const desc = item.content || item.contentSnippet || item.summary || item.description || "";
  const hrefs = [...String(item.content || "").matchAll(/href="(https?:[^"]+)"/gi)].map((m) => m[1]);
  const original = hrefs.find(
    (u) => !/news\.google\.com|googleusercontent\.com|google\.com\//.test(u)
  );
  let title = item.title || "";
  let sourceName = null;
  if (item.gSource) {
    sourceName = typeof item.gSource === "string" ? item.gSource : item.gSource;
  }
  const dash = title.match(/^(.*)[\s]+[-–—][\s]+(.{2,60})$/);
  if (dash && !sourceName) {
    title = dash[1].trim();
    sourceName = dash[2].trim();
  } else if (dash && sourceName) {
    title = dash[1].trim();
  }
  return {
    title,
    url: original || item.link,
    sourceName,
  };
}

function itemDate(item) {
  const raw = item.isoDate || item.pubDate || item.dcDate || item.date;
  if (!raw) return nowIso();
  const t = Date.parse(raw);
  return Number.isNaN(t) ? nowIso() : new Date(t).toISOString();
}

export async function upsertSources() {
  const stmt = db.prepare(`
    INSERT INTO sources (id, name, homepage, rss_url, type, location_level, language, via, active)
    VALUES (@id, @name, @homepage, @rss, @type, @locationLevel, @language, @via, 1)
    ON CONFLICT(id) DO UPDATE SET
      name=excluded.name, homepage=excluded.homepage, rss_url=excluded.rss_url,
      type=excluded.type, location_level=excluded.location_level,
      language=excluded.language, via=excluded.via, active=1
  `);
  const tx = db.transaction(async () => {
    for (const s of SOURCE_CATALOG) {
      await stmt.run({
        id: s.id,
        name: s.name,
        homepage: s.homepage || "",
        rss: s.rss,
        type: s.type,
        locationLevel: s.locationLevel,
        language: s.language,
        via: s.via || null,
      });
    }
  });
  await tx();
}

const insertArticle = db.prepare(`
  INSERT INTO articles (source_id, url, canonical_url, title, description, published_at, language, fetched_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(url) DO UPDATE SET
    title=excluded.title,
    description=COALESCE(excluded.description, articles.description),
    published_at=COALESCE(excluded.published_at, articles.published_at)
`);

const getByUrl = db.prepare("SELECT id FROM articles WHERE url = ?");

async function fetchFeed(source) {
  const feed = await parser.parseURL(source.rss);
  const items = feed.items || [];
  const rows = [];
  for (const item of items) {
    let title = itemText(item.title);
    let url = (typeof item.link === "string" ? item.link : item.link?.href || item.link?.url || "").trim();
    let extraName = null;
    if (!title || !url) continue;
    if (source.via === "google-news" || /news\.google\.com/.test(url)) {
      const u = unwrapGoogleNews(item);
      title = u.title || title;
      url = u.url || url;
      extraName = u.sourceName;
    }
    // Skip google wrapper URLs if we couldn't unwrap — still usable as a source link.
    const description = stripHtml(
      item.contentEncoded || item.content || item.contentSnippet || item.summary || ""
    ).slice(0, 2500);
    rows.push({
      source_id: source.id,
      url,
      title: title.slice(0, 400),
      description,
      published_at: itemDate(item),
      language: source.language,
      attributed_source: extraName,
    });
  }
  return rows;
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      try {
        out[idx] = { ok: true, value: await fn(items[idx], idx) };
      } catch (err) {
        out[idx] = { ok: false, error: err };
      }
      await sleep(250);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return out;
}

export async function fetchAllFeeds(onProgress) {
  upsertSources();
  const sources = SOURCE_CATALOG.filter((s) => s.rss);
  const report = [];
  let articlesFetched = 0;
  let articlesNew = 0;
  let feedsOk = 0;
  let feedsFailed = 0;

  const results = await mapLimit(sources, 3, async (source) => {
    const items = await fetchFeed(source);
    return { source, items };
  });

  const insertTx = db.transaction(async (items, sourceId) => {
    let neu = 0;
    const saved = [];
    for (const it of items) {
      const existed = await getByUrl.get(it.url);
      await insertArticle.run(
        sourceId,
        it.url,
        it.url,
        it.title,
        it.description,
        it.published_at,
        it.language,
        nowIso()
      );
      const row = await getByUrl.get(it.url);
      if (!existed) neu += 1;
      saved.push({ ...it, id: row.id, source_id: sourceId });
    }
    return { neu, saved };
  });

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const source = sources[i];
    if (!r.ok) {
      feedsFailed += 1;
      report.push({
        id: source.id,
        name: source.name,
        ok: false,
        error: String(r.error?.message || r.error).slice(0, 240),
        count: 0,
      });
      onProgress?.({ source: source.name, ok: false });
      continue;
    }
    const { items } = r.value;
    const { neu, saved } = await insertTx(items, source.id);
    feedsOk += 1;
    articlesFetched += items.length;
    articlesNew += neu;
    report.push({
      id: source.id,
      name: source.name,
      ok: true,
      count: items.length,
      new: neu,
      via: source.via || "rss",
    });
    onProgress?.({ source: source.name, ok: true, count: items.length });
    void saved;
  }

  return { feedsOk, feedsFailed, articlesFetched, articlesNew, report };
}

export async function recentArticles(hours = 72, { cap = Number(process.env.INGEST_ARTICLE_CAP || 500) } = {}) {
  const since = new Date(Date.now() - hours * 3600 * 1000).toISOString();
  const rows = await db
    .prepare(
      `SELECT a.*, s.name AS source_name, s.type AS source_type, s.location_level AS source_level, s.via,
              CASE WHEN EXISTS (SELECT 1 FROM story_articles sa WHERE sa.article_id = a.id) THEN 1 ELSE 0 END AS linked
       FROM articles a JOIN sources s ON s.id = a.source_id
       WHERE a.published_at >= ? OR a.fetched_at >= ?
       ORDER BY linked ASC, a.published_at DESC`
    )
    .all(since, since);
  if (!cap || rows.length <= cap) return rows;
  const unlinked = [];
  const priority = [];
  const rest = [];
  for (const a of rows) {
    if (!a.linked) unlinked.push(a);
    else if (a.source_type === "local" || a.source_type === "factcheck") priority.push(a);
    else rest.push(a);
  }
  // Unlinked rows (e.g. after a failed save) always come first so they get
  // clustered on the next run. Fill the remainder of the cap with local /
  // fact-check then other recent articles.
  const kept = [...unlinked];
  for (const a of [...priority, ...rest]) {
    if (kept.length >= Math.max(cap, unlinked.length)) break;
    kept.push(a);
  }
  return kept;
}
