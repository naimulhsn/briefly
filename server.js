import express from "express";
import helmet from "helmet";
import session from "express-session";
import path from "path";
import { config, ROOT } from "./src/config.js";
import { db, initDb, usingTurso } from "./src/db.js";
import { createSqliteStore } from "./src/session-store.js";
import { authRouter } from "./src/routes/auth.js";
import { accountRouter } from "./src/routes/account.js";
import { storiesRouter } from "./src/routes/stories.js";
import { statsRouter } from "./src/routes/stats.js";
import { ingestRouter } from "./src/routes/ingest.js";
import { startScheduler } from "./src/ingest/scheduler.js";
import { upsertSources } from "./src/ingest/fetch.js";
import { availableProcessor } from "./src/ai/index.js";

await initDb();
await upsertSources();

const app = express();
app.set("trust proxy", 1);
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "script-src": ["'self'"],
        "style-src": ["'self'", "https://fonts.googleapis.com"],
        "font-src": ["'self'", "https://fonts.gstatic.com"],
        "img-src": ["'self'", "data:"],
        "connect-src": ["'self'"],
      },
    },
  })
);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false }));
app.use(
  session({
    name: "briefly.sid",
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    store: await createSqliteStore(db),
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: config.cookieSecure,
      maxAge: 30 * 24 * 60 * 60 * 1000,
    },
  })
);

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    name: "Briefly",
    timezone: config.timezone,
    processor: availableProcessor(),
    database: usingTurso ? "turso" : "local-sqlite",
    time: new Date().toISOString(),
  });
});

app.use("/api/auth", authRouter);
app.use("/api", accountRouter);
app.use("/api/stories", storiesRouter);
app.use("/api/stats", statsRouter);
app.use("/api/ingest", ingestRouter);

app.use(express.static(path.join(ROOT, "public"), { maxAge: config.isProd ? "1h" : 0 }));
app.get(/.*/, (req, res) => {
  if (req.path.startsWith("/api/")) return res.status(404).json({ error: "Not found" });
  res.sendFile(path.join(ROOT, "public", "index.html"));
});

const server = app.listen(config.port, "0.0.0.0", () => {
  console.log(
    `Briefly listening on http://0.0.0.0:${config.port} (${availableProcessor()}, ${usingTurso ? "turso" : "local-sqlite"})`
  );
  startScheduler();
});

function shutdown() {
  server.close(() => {
    try {
      db.close();
    } catch {
      /* ignore */
    }
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

export default app;
