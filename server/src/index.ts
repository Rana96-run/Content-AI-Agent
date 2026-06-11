import app from "./app.js";
import { startSocialPoller } from "./lib/hubspot-social-poller.js";
import { startCompetitorPoller } from "./lib/competitor-poller.js";
import { startWeeklyDigest } from "./lib/weekly-digest.js";
import { startMonitorScheduler } from "./lib/competitor-monitor.js";
import { startVoiceRefresher } from "./lib/customer-voice.js";
import { startZatcaWatcher } from "./lib/zatca-watcher.js";
import { startDailyDigest } from "./lib/daily-digest.js";
import { callClaude } from "./lib/ai-call.js";
import { runSocialListener } from "./lib/social-listener.js";
import { runDailyCompetitorCapture } from "./lib/daily-competitor-capture.js";

const port = Number(process.env.PORT) || 8080;

// ─── Social Listening — every 6 hours ───────────────────────────────────────
let _listenerLastRun = 0;
function startSocialListenerScheduler(): void {
  setInterval(() => {
    const h = new Date().getUTCHours();
    if (h % 6 !== 0) return;                          // fire at 00, 06, 12, 18 UTC
    if (Date.now() - _listenerLastRun < 60 * 60 * 1_000) return;  // once per slot
    _listenerLastRun = Date.now();
    runSocialListener().catch(err =>
      console.error("[social-listener] cron error", String(err))
    );
  }, 60 * 60 * 1_000);
}

// ─── Daily Competitor Capture — 07:00 UTC ────────────────────────────────────
let _captureLastDay = "";
function startDailyCapture(): void {
  setInterval(() => {
    const now = new Date();
    if (now.getUTCHours() !== 7) return;
    const day = now.toISOString().slice(0, 10);
    if (_captureLastDay === day) return;
    _captureLastDay = day;
    runDailyCompetitorCapture().catch(err =>
      console.error("[daily-capture] cron error", String(err))
    );
  }, 60 * 60 * 1_000);
}

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`[server] listening on http://localhost:${port}`);
  startSocialPoller();
  startCompetitorPoller();
  startWeeklyDigest();
  startMonitorScheduler();
  startDailyDigest();          // Team Manager reviews all tasks daily 08:00 UTC → data/daily-summary.json
  startSocialListenerScheduler();  // Social listening — every 6h
  startDailyCapture();             // Daily competitor capture — 07:00 UTC
  // Knowledge feeds (D2 + D3) — make the agent smarter every day
  startVoiceRefresher(callClaude);
  startZatcaWatcher(callClaude);
});
