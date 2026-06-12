import app from "./app.js";
import { startSocialPoller } from "./lib/hubspot-social-poller.js";
import { startCompetitorPoller } from "./lib/competitor-poller.js";
import { startWeeklyDigest } from "./lib/weekly-digest.js";
import { startVoiceRefresher } from "./lib/customer-voice.js";
import { startZatcaWatcher } from "./lib/zatca-watcher.js";
import { startDailyDigest } from "./lib/daily-digest.js";
import { callClaude } from "./lib/ai-call.js";
import { startMonthlyCalendar } from "./lib/monthly-calendar.js";

const port = Number(process.env.PORT) || 8080;

// Social listener, daily competitor capture, and weekly monitor are
// scheduled exclusively via cowork tasks to avoid double-runs.

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`[server] listening on http://localhost:${port}`);
  startSocialPoller();
  startCompetitorPoller();      // Gemini-based 6h scraper (no cowork equivalent)
  startWeeklyDigest();
  startDailyDigest();           // Team Manager reviews all tasks daily 08:00 UTC
  startMonthlyCalendar();       // Monthly content calendar — 1st of month 08:00 UTC
  // Knowledge feeds (D2 + D3) — make the agent smarter every day
  startVoiceRefresher(callClaude);
  startZatcaWatcher(callClaude);
});
