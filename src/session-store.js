import session from "express-session";

export async function createSqliteStore(db) {
  // Schema is also created in initDb(); this is a safe no-op if already present.
  await db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      sid TEXT PRIMARY KEY,
      sess TEXT NOT NULL,
      expire INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_expire ON sessions(expire);
  `);

  const getStmt = db.prepare("SELECT sess, expire FROM sessions WHERE sid = ?");
  const setStmt = db.prepare(
    "INSERT INTO sessions (sid, sess, expire) VALUES (?, ?, ?) ON CONFLICT(sid) DO UPDATE SET sess = excluded.sess, expire = excluded.expire"
  );
  const delStmt = db.prepare("DELETE FROM sessions WHERE sid = ?");
  const touchStmt = db.prepare("UPDATE sessions SET expire = ? WHERE sid = ?");
  const pruneStmt = db.prepare("DELETE FROM sessions WHERE expire < ?");

  class SqliteStore extends session.Store {
    constructor() {
      super();
      this.pruneInterval = setInterval(() => {
        pruneStmt.run(Date.now()).catch(() => {});
      }, 15 * 60 * 1000);
      this.pruneInterval.unref?.();
    }

    async get(sid, cb) {
      try {
        const row = await getStmt.get(sid);
        if (!row) return cb(null, null);
        if (row.expire < Date.now()) {
          await delStmt.run(sid);
          return cb(null, null);
        }
        return cb(null, JSON.parse(row.sess));
      } catch (err) {
        return cb(err);
      }
    }

    async set(sid, sess, cb) {
      try {
        const maxAge = sess.cookie?.maxAge || 30 * 24 * 60 * 60 * 1000;
        const expire = Date.now() + maxAge;
        await setStmt.run(sid, JSON.stringify(sess), expire);
        cb?.(null);
      } catch (err) {
        cb?.(err);
      }
    }

    async destroy(sid, cb) {
      try {
        await delStmt.run(sid);
        cb?.(null);
      } catch (err) {
        cb?.(err);
      }
    }

    async touch(sid, sess, cb) {
      try {
        const maxAge = sess.cookie?.maxAge || 30 * 24 * 60 * 60 * 1000;
        await touchStmt.run(Date.now() + maxAge, sid);
        cb?.(null);
      } catch (err) {
        cb?.(err);
      }
    }
  }

  return new SqliteStore();
}
