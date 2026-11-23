import { Router } from "express";
import { config } from "../config.js";
import { runIngest, reclusterArchive, getRunning, latestRun } from "../ingest/process.js";

export const ingestRouter = Router();

function authorized(req) {
  if (getRunning()) return { ok: false, status: 409, error: "An ingest is already running." };
  const secret = config.ingestSecret;
  const provided =
    req.get("x-ingest-secret") ||
    (req.get("authorization") || "").replace(/^Bearer\s+/i, "") ||
    req.body?.secret ||
    req.query.secret;
  if (secret) {
    if (provided !== secret) return { ok: false, status: 401, error: "Invalid ingest secret." };
    return { ok: true };
  }
  // No secret configured: allow in development, or if the caller is signed in.
  if (!config.isProd) return { ok: true };
  if (req.session?.userId) return { ok: true };
  return { ok: false, status: 401, error: "Ingest secret required." };
}

ingestRouter.get("/status", async (req, res) => {
  res.json({ running: getRunning(), latest: await latestRun() });
});

ingestRouter.post("/run", async (req, res) => {
  const auth = authorized(req);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
  // Run in the background so a 30–100s proxy timeout cannot kill the briefing.
  runIngest({
    log: (...a) => console.log("[ingest]", ...a),
  })
    .then((result) => {
      if (result?.ok) {
        console.log(
          "[ingest] finished",
          `feeds ${result.feedsOk}/${result.feedsOk + result.feedsFailed}`,
          `stories +${result.clustersCreated}`
        );
      } else {
        console.log("[ingest] ended", result?.error || result);
      }
    })
    .catch((err) => {
      console.error("[ingest] failed", err.message || err);
    });
  res.status(202).json({
    ok: true,
    accepted: true,
    message: "Ingest started. Poll GET /api/ingest/status until running is null.",
  });
});

ingestRouter.post("/recluster", async (req, res) => {
  const auth = authorized(req);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
  reclusterArchive({
    log: (...a) => console.log("[recluster]", ...a),
  })
    .then((result) => {
      if (result?.ok) {
        console.log("[recluster] finished", `${result.before} → ${result.after} stories`);
      } else {
        console.log("[recluster] ended", result?.error || result);
      }
    })
    .catch((err) => {
      console.error("[recluster] failed", err.message || err);
    });
  res.status(202).json({
    ok: true,
    accepted: true,
    message: "Recluster started. Poll GET /api/ingest/status until running is null.",
  });
});
