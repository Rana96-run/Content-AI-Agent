import app from "./app.js";
import { startSocialPoller } from "./lib/hubspot-social-poller.js";
import { startVoiceRefresher } from "./lib/customer-voice.js";
import { startZatcaWatcher } from "./lib/zatca-watcher.js";
import { callClaude } from "./lib/ai-call.js";

const port = Number(process.env.PORT) || 8080;

// All AI-calling scheduled jobs (social listener, competitor capture/poller,
// weekly monitor, weekly digest, daily digest, monthly calendar) are
// managed exclusively via Claude Code scheduled tasks → Railway run-now
// endpoints, to prevent double-runs and keep scheduling visible in one place.

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`[server] listening on http://localhost:${port}`);
  startSocialPoller();
  // Knowledge feeds (D2 + D3) — passive background refreshes, no AI scheduling needed
  startVoiceRefresher(callClaude);
  startZatcaWatcher(callClaude);
});
