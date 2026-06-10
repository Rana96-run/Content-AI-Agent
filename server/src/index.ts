import app from "./app.js";
import { startSocialPoller } from "./lib/hubspot-social-poller.js";
import { startCompetitorPoller } from "./lib/competitor-poller.js";
import { startWeeklyDigest } from "./lib/weekly-digest.js";
import { startMonitorScheduler } from "./lib/competitor-monitor.js";
import { startVoiceRefresher } from "./lib/customer-voice.js";
import { startZatcaWatcher } from "./lib/zatca-watcher.js";
import { startDailyDigest } from "./lib/daily-digest.js";
import { callClaude } from "./lib/ai-call.js";

const port = Number(process.env.PORT) || 8080;

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`[server] listening on http://localhost:${port}`);
  startSocialPoller();
  startCompetitorPoller();
  startWeeklyDigest();
  startMonitorScheduler();
  startDailyDigest();          // Team Manager reviews all tasks daily 08:00 UTC → data/daily-summary.json
  // Knowledge feeds (D2 + D3) — make the agent smarter every day
  startVoiceRefresher(callClaude);
  startZatcaWatcher(callClaude);
});
