import cron from "node-cron";
import { runIngest, getRunning } from "./process.js";

export function startScheduler() {
  // 6:00 and 18:00 Asia/Dhaka, every day.
  const task = cron.schedule(
    "0 6,18 * * *",
    async () => {
      if (getRunning()) {
        console.log("[scheduler] skipped, ingest already running");
        return;
      }
      console.log("[scheduler] starting scheduled briefing ingest");
      try {
        await runIngest({ log: (...a) => console.log("[scheduler]", ...a) });
      } catch (err) {
        console.error("[scheduler] ingest failed:", err.message);
      }
    },
    { timezone: "Asia/Dhaka" }
  );
  return task;
}
