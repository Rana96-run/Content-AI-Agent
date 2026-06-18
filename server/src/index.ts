import app from "./app.js";

const port = Number(process.env.PORT) || 8080;

// All scheduled AI jobs are managed via cowork tasks → Railway run-now endpoints.
// HubSpot Social Poller is triggered via n8n webhook (no polling loop needed).
// Canva staging GC and Agent Scheduler run inside app.ts on boot.

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`[server] listening on http://localhost:${port}`);
});
