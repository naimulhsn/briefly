import { createClient } from "@libsql/client";
import { AsyncLocalStorage } from "node:async_hooks";
import { config } from "./config.js";

const txStore = new AsyncLocalStorage();

function connectionOptions() {
  if (config.tursoUrl) {
    return { url: config.tursoUrl, authToken: config.tursoToken || undefined };
  }
  const filePath = config.dbPath;
  const url = filePath.startsWith("file:") ? filePath : `file:${filePath}`;
  return { url };
}

function toArgs(params) {
  if (params.length === 1 && params[0] != null && typeof params[0] === "object" && !Array.isArray(params[0])) {
    const raw = params[0];
    const named = {};
    for (const [k, v] of Object.entries(raw)) {
      named[k.startsWith("@") || k.startsWith(":") || k.startsWith("$") ? k.replace(/^[:@$]/, "") : k] = v;
    }
    return named;
  }
  if (params.length === 1 && Array.isArray(params[0])) return params[0];
  return params;
}

function rowObject(row) {
  if (row == null) return undefined;
  // libSQL Row is array-like with enumerable named keys.
  const out = {};
  for (const key of Object.keys(row)) {
    if (Number.isNaN(Number(key))) out[key] = row[key];
  }
  return out;
}

class Statement {
  constructor(sql) {
    this.sql = sql;
  }

  _conn() {
    return txStore.getStore() || client;
  }

  async get(...params) {
    const rs = await this._conn().execute({ sql: this.sql, args: toArgs(params) });
    return rs.rows[0] ? rowObject(rs.rows[0]) : undefined;
  }

  async all(...params) {
    const rs = await this._conn().execute({ sql: this.sql, args: toArgs(params) });
    return rs.rows.map(rowObject);
  }

  async run(...params) {
    const rs = await this._conn().execute({ sql: this.sql, args: toArgs(params) });
    return {
      lastInsertRowid: rs.lastInsertRowid != null ? Number(rs.lastInsertRowid) : 0,
      changes: Number(rs.rowsAffected || 0),
    };
  }
}

class LibsqlDb {
  prepare(sql) {
    return new Statement(sql);
  }

  async exec(sql) {
    const conn = txStore.getStore() || client;
    if (typeof conn.executeMultiple === "function") {
      await conn.executeMultiple(sql);
      return;
    }
    const parts = String(sql)
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const part of parts) {
      await conn.execute(part);
    }
  }

  transaction(fn) {
    return async (...args) => {
      const tx = await client.transaction("write");
      try {
        const result = await txStore.run(tx, () => fn(...args));
        await tx.commit();
        return result;
      } catch (err) {
        try {
          await tx.rollback();
        } catch {
          /* ignore */
        }
        throw err;
      }
    };
  }

  close() {
    try {
      client.close();
    } catch {
      /* ignore */
    }
  }
}

export const client = createClient(connectionOptions());
export const db = new LibsqlDb();
export const usingTurso = Boolean(config.tursoUrl);

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  home_area TEXT NOT NULL DEFAULT 'Pagar, Tongi, Gazipur',
  categories TEXT NOT NULL DEFAULT '[]',
  followed_parties TEXT NOT NULL DEFAULT '[]',
  followed_sources TEXT NOT NULL DEFAULT '[]',
  muted_topics TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  homepage TEXT,
  rss_url TEXT,
  type TEXT NOT NULL,
  location_level TEXT,
  language TEXT,
  via TEXT,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS articles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id TEXT NOT NULL REFERENCES sources(id),
  url TEXT NOT NULL UNIQUE,
  canonical_url TEXT,
  title TEXT NOT NULL,
  description TEXT,
  published_at TEXT,
  language TEXT,
  fetched_at TEXT NOT NULL,
  raw_hash TEXT
);

CREATE INDEX IF NOT EXISTS idx_articles_source ON articles(source_id);
CREATE INDEX IF NOT EXISTS idx_articles_published ON articles(published_at);

CREATE TABLE IF NOT EXISTS stories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  summary TEXT,
  key_facts TEXT NOT NULL DEFAULT '[]',
  source_differences TEXT,
  location_level TEXT NOT NULL DEFAULT 'country',
  location_name TEXT,
  category TEXT NOT NULL DEFAULT 'other',
  legal_label TEXT NOT NULL DEFAULT 'other',
  legal_note TEXT,
  law_suggestion TEXT,
  fact_checked INTEGER NOT NULL DEFAULT 0,
  fact_check_url TEXT,
  fact_check_source TEXT,
  published_at TEXT,
  updated_at TEXT,
  geo_score INTEGER NOT NULL DEFAULT 20,
  processor TEXT,
  cluster_key TEXT,
  article_count INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_stories_published ON stories(published_at);
CREATE INDEX IF NOT EXISTS idx_stories_category ON stories(category);
CREATE INDEX IF NOT EXISTS idx_stories_location ON stories(location_level);
CREATE INDEX IF NOT EXISTS idx_stories_legal ON stories(legal_label);
CREATE INDEX IF NOT EXISTS idx_stories_geo ON stories(geo_score);

CREATE TABLE IF NOT EXISTS story_articles (
  story_id INTEGER NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  PRIMARY KEY (story_id, article_id)
);

CREATE TABLE IF NOT EXISTS story_parties (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  story_id INTEGER NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  party_name TEXT NOT NULL,
  role TEXT NOT NULL,
  UNIQUE (story_id, party_name, role)
);

CREATE INDEX IF NOT EXISTS idx_story_parties_party ON story_parties(party_name);

CREATE TABLE IF NOT EXISTS bookmarks (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  story_id INTEGER NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, story_id)
);

CREATE TABLE IF NOT EXISTS ingestion_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL,
  feeds_ok INTEGER DEFAULT 0,
  feeds_failed INTEGER DEFAULT 0,
  articles_fetched INTEGER DEFAULT 0,
  articles_new INTEGER DEFAULT 0,
  clusters_created INTEGER DEFAULT 0,
  clusters_updated INTEGER DEFAULT 0,
  ai_processed INTEGER DEFAULT 0,
  processor TEXT,
  error TEXT,
  source_report TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  sid TEXT PRIMARY KEY,
  sess TEXT NOT NULL,
  expire INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_expire ON sessions(expire);
`;

let initialized = false;

export async function initDb() {
  if (initialized) return;
  if (!usingTurso) {
    try {
      await client.execute("PRAGMA journal_mode = WAL");
      await client.execute("PRAGMA foreign_keys = ON");
      await client.execute("PRAGMA busy_timeout = 5000");
    } catch {
      /* remote-style file clients may reject some pragmas */
    }
  }
  await db.exec(SCHEMA);
  initialized = true;
}

export function nowIso() {
  return new Date().toISOString();
}

export function parseJson(value, fallback) {
  if (value == null || value === "") return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}
