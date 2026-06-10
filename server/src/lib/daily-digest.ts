/**
 * Daily Team Digest — 08:00 UTC every day
 *
 * Reads all tasks completed in the last 24h from the persisted store,
 * groups them by agent persona, and posts a structured summary to Slack.
 * The Team Manager (orchestrator) is the "reviewer" — it owns this report.
 *
 * Schedule: daily 08:00 UTC. Manual trigger: POST /api/agent/daily-digest/run-now
 */

import { loadTasks } from "./agent-store.js";
import { PERSONAS } from "./agent-personas.js";
import { logger } from "./logger.js";

const SLACK_TOKEN   = process.env.SLACK_BOT_TOKEN;
const SLACK_CHANNEL = process.env.SLACK_REPORT_CHANNEL || process.env.SLACK_CHANNEL;

const CHECK_INTERVAL_MS = 60 * 60 * 1_000; // check every hour
let lastRunDay: string | null = null;

function dayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

function shouldRunNow(): boolean {
  const now = new Date();
  if (now.getUTCHours() !== 8) return false;
  if (lastRunDay === dayKey(now)) return false;
  return true;
}

const PERSONA_EM: Record<string, string> = {
  social_media:       "📱",
  content_creator:    "✍",
  email_lifecycle:    "📧",
  paid_media_analyst: "📡",
  editor_qa:          "🔍",
  orchestrator:       "🎼",
};

export async function runDailyDigest(): Promise<{ ok: boolean; summary?: string; error?: string }> {
  try {
    const since = Date.now() - 24 * 60 * 60 * 1_000;
    const tasks = loadTasks().filter(t => t.created_at >= since);
    const today = dayKey();

    if (tasks.length === 0) {
      const msg = `*Daily Team Review — ${today}*\nNo tasks recorded in the last 24h.`;
      await slackPost(msg);
      return { ok: true, summary: msg };
    }

    // Group by persona
    const byPersona: Record<string, typeof tasks> = {};
    for (const t of tasks) {
      const p = t.persona || "orchestrator";
      if (!byPersona[p]) byPersona[p] = [];
      byPersona[p].push(t);
    }

    const done   = tasks.filter(t => t.status === "done").length;
    const errors = tasks.filter(t => t.status === "error").length;

    const lines: string[] = [
      `*Daily Team Review — ${today}*`,
      `${tasks.length} tasks in the last 24h  ·  ${done} done  ·  ${errors > 0 ? `${errors} errors` : "0 errors"}`,
      "",
    ];

    // Preferred display order
    const order = ["social_media", "content_creator", "paid_media_analyst", "email_lifecycle", "editor_qa", "orchestrator"];
    const sorted = [...order.filter(p => byPersona[p]), ...Object.keys(byPersona).filter(p => !order.includes(p))];

    for (const personaId of sorted) {
      const ptasks = byPersona[personaId];
      if (!ptasks?.length) continue;
      const persona = PERSONAS[personaId as keyof typeof PERSONAS];
      const label   = persona?.label_en || personaId;
      const em      = PERSONA_EM[personaId] || "●";
      const pdone   = ptasks.filter(t => t.status === "done").length;
      const perr    = ptasks.filter(t => t.status === "error").length;
      lines.push(`${em} *${label}* — ${ptasks.length} tasks (${pdone} done${perr ? `, ${perr} errors` : ""})`);
      for (const t of ptasks.slice(0, 4)) {
        const trigger = t.trigger as Record<string, unknown>;
        const title   = (trigger?.title as string) || (trigger?.body as string)?.slice(0, 70) || t.id;
        const icon    = t.status === "done" ? "✓" : t.status === "error" ? "✗" : "○";
        lines.push(`  ${icon} ${title}`);
      }
      if (ptasks.length > 4) lines.push(`  … +${ptasks.length - 4} more`);
      lines.push("");
    }

    lines.push("_النظام يتعلم ويتطور — قيود · Social Media Artist_");

    const summary = lines.join("\n");
    await slackPost(summary);
    logger.info({ tasks: tasks.length, personas: Object.keys(byPersona).length }, "daily-digest: posted");
    return { ok: true, summary };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.error({ err: error }, "daily-digest: failed");
    return { ok: false, error };
  }
}

async function slackPost(text: string): Promise<void> {
  if (!SLACK_TOKEN || !SLACK_CHANNEL) {
    logger.warn("daily-digest: SLACK_BOT_TOKEN or SLACK_CHANNEL not set — skipping Slack post");
    return;
  }
  try {
    const r = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8", Authorization: `Bearer ${SLACK_TOKEN}` },
      body: JSON.stringify({ channel: SLACK_CHANNEL, text }),
    });
    const j = await r.json() as { ok: boolean; error?: string };
    if (!j.ok) logger.error({ error: j.error }, "daily-digest: slack post failed");
  } catch (e) {
    logger.warn({ err: String(e) }, "daily-digest: slack post threw");
  }
}

export function startDailyDigest(): void {
  setInterval(async () => {
    if (!shouldRunNow()) return;
    lastRunDay = dayKey();
    logger.info("daily-digest: firing 08:00 UTC review");
    await runDailyDigest();
  }, CHECK_INTERVAL_MS);
  logger.info("daily-digest: scheduler started (fires daily 08:00 UTC)");
}
