/**
 * Daily Team Digest — 08:00 UTC every day
 *
 * Team Manager reviews all tasks from the last 24h, updates agent memory
 * with notable patterns, and writes a structured summary to
 * server/data/daily-summary.json (served via GET /api/agent/daily-summary).
 *
 * Schedule: daily 08:00 UTC. Manual trigger: POST /api/agent/daily-digest/run-now
 */

import fs from "fs";
import path from "path";
import { loadTasks } from "./agent-store.js";
import { PERSONAS } from "./agent-personas.js";
import { upsertFact } from "./agent-memory.js";
import { logger } from "./logger.js";

const SUMMARY_PATH = path.resolve(process.cwd(), "data", "daily-summary.json");

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

export interface DigestSummary {
  date: string;
  generated_at: number;
  total: number;
  done: number;
  errors: number;
  personas: Array<{
    id: string;
    label: string;
    em: string;
    total: number;
    done: number;
    errors: number;
    tasks: Array<{ title: string; status: string }>;
  }>;
  text: string;
}

function saveDigest(data: DigestSummary): void {
  try {
    const dir = path.dirname(SUMMARY_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const tmp = SUMMARY_PATH + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
    fs.renameSync(tmp, SUMMARY_PATH);
  } catch (e) {
    logger.warn({ err: String(e) }, "daily-digest: save to file failed");
  }
}

function updateMemory(byPersona: Record<string, number>, today: string, erroredPersonas: string[]): void {
  try {
    const mostActive = Object.entries(byPersona).sort((a, b) => b[1] - a[1])[0];
    if (mostActive) {
      upsertFact(
        `daily_most_active_${today}`,
        `Most active agent on ${today}: ${mostActive[0]} with ${mostActive[1]} tasks`,
        "daily-digest"
      );
    }
    if (erroredPersonas.length > 0) {
      upsertFact(
        `daily_errors_${today}`,
        `Agents with errors on ${today}: ${erroredPersonas.join(", ")}`,
        "daily-digest"
      );
    }
  } catch (e) {
    logger.warn({ err: String(e) }, "daily-digest: memory update failed");
  }
}

export function readLatestDigest(): DigestSummary | null {
  try {
    if (!fs.existsSync(SUMMARY_PATH)) return null;
    return JSON.parse(fs.readFileSync(SUMMARY_PATH, "utf8")) as DigestSummary;
  } catch {
    return null;
  }
}

export async function runDailyDigest(): Promise<{ ok: boolean; summary?: string; error?: string }> {
  try {
    const since = Date.now() - 24 * 60 * 60 * 1_000;
    const tasks = loadTasks().filter(t => t.created_at >= since);
    const today = dayKey();

    if (tasks.length === 0) {
      const data: DigestSummary = {
        date: today,
        generated_at: Date.now(),
        total: 0, done: 0, errors: 0,
        personas: [],
        text: `Daily Team Review — ${today}\nNo tasks recorded in the last 24h.`,
      };
      saveDigest(data);
      return { ok: true, summary: data.text };
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
      `Daily Team Review — ${today}`,
      `${tasks.length} tasks · ${done} done · ${errors > 0 ? `${errors} errors` : "0 errors"}`,
      "",
    ];

    const order = ["social_media", "content_creator", "paid_media_analyst", "email_lifecycle", "editor_qa", "orchestrator"];
    const sorted = [...order.filter(p => byPersona[p]), ...Object.keys(byPersona).filter(p => !order.includes(p))];

    const personaSummaries: DigestSummary["personas"] = [];
    const erroredPersonas: string[] = [];
    const personaTaskCounts: Record<string, number> = {};

    for (const personaId of sorted) {
      const ptasks = byPersona[personaId];
      if (!ptasks?.length) continue;
      const persona = PERSONAS[personaId as keyof typeof PERSONAS];
      const label   = persona?.label_en || personaId;
      const em      = PERSONA_EM[personaId] || "●";
      const pdone   = ptasks.filter(t => t.status === "done").length;
      const perr    = ptasks.filter(t => t.status === "error").length;

      if (perr > 0) erroredPersonas.push(personaId);
      personaTaskCounts[personaId] = ptasks.length;

      lines.push(`${em} ${label} — ${ptasks.length} tasks (${pdone} done${perr ? `, ${perr} errors` : ""})`);
      const taskList: Array<{ title: string; status: string }> = [];
      for (const t of ptasks.slice(0, 4)) {
        const trigger = t.trigger as Record<string, unknown>;
        const title   = (trigger?.title as string) || (trigger?.body as string)?.slice(0, 70) || t.id;
        const icon    = t.status === "done" ? "✓" : t.status === "error" ? "✗" : "○";
        lines.push(`  ${icon} ${title}`);
        taskList.push({ title, status: t.status });
      }
      if (ptasks.length > 4) lines.push(`  … +${ptasks.length - 4} more`);
      lines.push("");

      personaSummaries.push({ id: personaId, label, em, total: ptasks.length, done: pdone, errors: perr, tasks: taskList });
    }

    lines.push("النظام يتعلم ويتطور — قيود · Social Media Artist");

    const text = lines.join("\n");

    const data: DigestSummary = {
      date: today,
      generated_at: Date.now(),
      total: tasks.length,
      done,
      errors,
      personas: personaSummaries,
      text,
    };

    saveDigest(data);
    updateMemory(personaTaskCounts, today, erroredPersonas);

    logger.info({ tasks: tasks.length, personas: personaSummaries.length }, "daily-digest: saved");
    return { ok: true, summary: text };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.error({ err: error }, "daily-digest: failed");
    return { ok: false, error };
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
