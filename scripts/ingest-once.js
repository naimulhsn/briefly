import { runIngest } from "../src/ingest/process.js";

const result = await runIngest({ log: (...a) => console.log(...a) });
console.log(JSON.stringify({
  ok: result.ok,
  feedsOk: result.feedsOk,
  feedsFailed: result.feedsFailed,
  articlesFetched: result.articlesFetched,
  articlesNew: result.articlesNew,
  clustersCreated: result.clustersCreated,
  clustersUpdated: result.clustersUpdated,
  aiProcessed: result.aiProcessed,
  processor: result.processor,
  failed: (result.report || []).filter((r) => !r.ok).map((r) => r.name + ": " + r.error),
}, null, 2));
process.exit(result.ok ? 0 : 1);
