/**
 * Competitor Monitor — automated weekly intelligence reports.
 *
 * Every Sunday 09:00 UTC:
 *   1. Scrape FB ads (Apify), IG organic (Apify), Google ads (jina) for each
 *      tracked competitor
 *   2. Save snapshot to /server/data/competitor-snapshots/<competitor>/<date>.json
 *   3. Diff this week vs last week
 *   4. Ask Claude to summarize the diff in Saudi Arabic
 *   5. Post the report to Slack (SLACK_REPORT_CHANNEL)
 *
 * Manual trigger: POST /api/competitor-ads/run-monitor-now
 */

import * as fs from "node:fs";
import * as path from "node:path";
import {
  diffSnapshots,
  buildAIPrompt,
  formatSlackBlocks,
  type CompetitorSnapshot,
  type AdSnapshot,
} from "./competitor-weekly-report.js";
import { sheetsAppendCompetitorPosts, sheetsHealthCheck } from "./sheets-client.js";
import type { CompetitorPost } from "./content-library.js";
import { buildContextPrompt, renderContextMarkdown, saveContext } from "./competitor-context.js";
import { extractKnowledgeFromMonitor } from "./knowledge-base.js";
import { renderWeeklyDocHtml } from "./competitor-doc-renderer.js";
import { driveUploadAsGoogleDoc } from "../routes/drive.js";
import { createWeeklySlidesPresentation } from "./competitor-slides-renderer.js";
import { logger } from "./logger.js";

// Tracked competitors — each entry is the COMPETITORS key from competitor-ads.ts
const TRACKED = ["Daftra", "Foodics", "Rewaa", "Wafeq"];

const SNAPSHOTS_DIR = path.resolve(process.cwd(), "server/data/competitor-snapshots");
const CHECK_INTERVAL_MS = 60 * 60 * 1_000; // every hour
let lastRunDay: string | null = null;

function dayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

function shouldRunNow(): boolean {
  const now = new Date();
  if (now.getUTCDay() !== 0) return false;            // Sunday only
  if (now.getUTCHours() !== 9) return false;          // 09:00 UTC only
  if (lastRunDay === dayKey(now)) return false;       // already ran today
  return true;
}

function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true });
}

function snapshotPath(competitor: string, day: string): string {
  return path.join(SNAPSHOTS_DIR, competitor, `${day}.json`);
}

function readSnapshot(competitor: string, day: string): CompetitorSnapshot | null {
  try {
    const text = fs.readFileSync(snapshotPath(competitor, day), "utf-8");
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function writeSnapshot(snap: CompetitorSnapshot, day: string) {
  const dir = path.dirname(snapshotPath(snap.competitor, day));
  ensureDir(dir);
  fs.writeFileSync(snapshotPath(snap.competitor, day), JSON.stringify(snap, null, 2));
}

function previousSundayKey(d = new Date()): string {
  const last = new Date(d);
  last.setUTCDate(last.getUTCDate() - 7);
  return dayKey(last);
}

/* Scrape one competitor across all 3 sources via the local server's own
   /api/competitor-ads endpoint. Using HTTP keeps the logic in one place
   and reuses the Apify/jina handling. */
async function scrapeCompetitor(competitor: string): Promise<CompetitorSnapshot> {
  const port = process.env.PORT || 8080;
  const base = `http://localhost:${port}`;
  const sources = ["facebook", "instagram", "google", "youtube", "tiktok", "snapchat", "linkedin"] as const;
  const results: Partial<CompetitorSnapshot> = {
    competitor,
    domain: "",
    fetched_at: new Date().toISOString(),
  };

  for (const source of sources) {
    try {
      const r = await fetch(`${base}/api/competitor-ads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source, competitor, country: "SA", limit: 10 }),
        signal: AbortSignal.timeout(120_000),
      });
      const j = (await r.json().catch(() => ({}))) as any;
      if (j.ok && Array.isArray(j.ads)) {
        results[source as "facebook" | "instagram" | "google" | "youtube" | "tiktok" | "snapchat" | "linkedin"] = j.ads as AdSnapshot[];
        if (j.competitor) results.domain = j.competitor;
      } else {
        logger.warn({ source, competitor, error: j.error }, "monitor: source returned no ads");
      }
    } catch (err) {
      logger.error(
        { source, competitor, err: err instanceof Error ? err.message : String(err) },
        "monitor: source failed",
      );
    }
  }

  return results as CompetitorSnapshot;
}

/* Call Anthropic for the AI summary of the diff. Mirrors generate.ts logic. */
async function callClaude(system: string, user: string, max_tokens: number): Promise<any> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5",
      max_tokens,
      system,
      messages: [
        { role: "user", content: user },
        { role: "assistant", content: "{" },
      ],
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!r.ok) throw new Error(`Anthropic ${r.status}`);
  const data = (await r.json()) as any;
  const text = "{" + (data.content?.[0]?.text || "");
  try {
    return JSON.parse(text);
  } catch {
    return { headline: "AI parse failed", competitors: [], recommended_actions: [] };
  }
}

async function postToSlack(blocks: any[], summary: string): Promise<void> {
  const token = process.env.SLACK_BOT_TOKEN;
  // Match the convention used by weekly-digest.ts. Optional SLACK_REPORT_CHANNEL
  // lets you route competitor intel to a different channel than the digest.
  const channel = process.env.SLACK_REPORT_CHANNEL || process.env.SLACK_DEFAULT_CHANNEL || process.env.SLACK_CHANNEL || "#general";
  if (!token) {
    logger.warn("monitor: SLACK_BOT_TOKEN not set — skipping Slack post");
    return;
  }
  try {
    const r = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ channel, blocks, text: summary }),
      signal: AbortSignal.timeout(15_000),
    });
    const j = (await r.json().catch(() => ({}))) as any;
    if (!j.ok) logger.error({ error: j.error }, "monitor: slack post failed");
    else logger.info({ channel, ts: j.ts }, "monitor: slack post sent");
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : String(err) },
      "monitor: slack post threw",
    );
  }
}

/* Public: run the full pipeline once. Used by both the scheduler and the
   /api/competitor-ads/run-monitor-now manual trigger. */
export async function runMonitorOnce(opts: { competitors?: string[]; postToSlack?: boolean } = {}): Promise<{
  week: string;
  competitors_scraped: number;
  diffs: any[];
  ai: any;
  slack_posted: boolean;
  report_doc_url?: string;
  report_slides_url?: string;
  sheet_url?: string;
}> {
  const competitors = opts.competitors || TRACKED;
  const today = dayKey();
  const lastWeekDay = previousSundayKey();

  logger.info({ competitors, today }, "monitor: starting weekly run");

  // 1. Scrape each competitor + write each batch to the Google Sheet
  const thisWeek: CompetitorSnapshot[] = [];
  const allSheetRows: CompetitorPost[] = [];
  const fetchedAt = new Date().toISOString();
  for (const comp of competitors) {
    const snap = await scrapeCompetitor(comp);
    writeSnapshot(snap, today);
    thisWeek.push(snap);
    // Flatten this competitor's ads into the Sheet's CompetitorPost shape
    const flatten = (ads: AdSnapshot[] | undefined, channel: string) =>
      (ads || []).map((a): CompetitorPost => ({
        competitor: comp,
        channel,
        content_text: [a.hook, a.body, a.caption].filter(Boolean).join(" — ").slice(0, 800),
        post_url: a.detail_url || undefined,
        fetched_at: fetchedAt,
        engagement_hint: (a.platforms || []).join(",") || undefined,
      }));
    allSheetRows.push(...flatten(snap.facebook, "Facebook Ads"));
    allSheetRows.push(...flatten(snap.instagram, "Instagram"));
    allSheetRows.push(...flatten(snap.google, "Google Ads"));
    allSheetRows.push(...flatten(snap.youtube, "YouTube"));
    allSheetRows.push(...flatten(snap.tiktok, "TikTok"));
    allSheetRows.push(...flatten(snap.snapchat, "Snapchat"));
    allSheetRows.push(...flatten(snap.linkedin, "LinkedIn"));
  }

  // Append all scraped posts to the Google Sheet (deduped by URL inside)
  if (allSheetRows.length > 0) {
    try {
      await sheetsAppendCompetitorPosts(allSheetRows);
      logger.info({ count: allSheetRows.length }, "monitor: posts appended to Google Sheet");
    } catch (err) {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        "monitor: sheet append failed (non-fatal)",
      );
    }
  }

  // 2. Load last week's snapshots (for diff). Missing = treated as fresh.
  const lastWeek: CompetitorSnapshot[] = competitors
    .map((c) => readSnapshot(c, lastWeekDay))
    .filter((s): s is CompetitorSnapshot => s !== null);

  // 3. Diff
  const diffs = thisWeek.map((tw) => {
    const lw = lastWeek.find((l) => l.competitor === tw.competitor) || null;
    return diffSnapshots(tw, lw);
  });

  // 4. AI summary
  const weekLabel = new Date().toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const { system, user } = buildAIPrompt(diffs, weekLabel);
  let ai: any = {};
  try {
    ai = await callClaude(system, user, 2500);
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : String(err) },
      "monitor: AI summary failed",
    );
    ai = { headline: "AI summary unavailable", competitors: [], recommended_actions: [] };
  }

  // 4b. Synthesize a SHORT competitive context doc that gets injected into
  //     content/campaign/calendar prompts. This is the "build on, don't dump"
  //     transformation the user asked for.
  try {
    const ctxPrompt = buildContextPrompt(diffs, weekLabel);
    const ctxAi = await callClaude(ctxPrompt.system, ctxPrompt.user, 1200);
    const md = renderContextMarkdown(ctxAi, weekLabel);
    saveContext({
      generated_at: new Date().toISOString(),
      week: weekLabel,
      summary: ctxAi.summary || "",
      themes: ctxAi.themes || [],
      qoyod_positioning: ctxAi.qoyod_positioning || "",
      raw_markdown: md,
    });
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "monitor: context synthesis failed (non-fatal)",
    );
  }

  // 4c. Extract and accumulate new knowledge entries from this week's data.
  //     This is the self-learning loop: every week the system gets smarter.
  //     New ICPs, proven hooks, sector patterns, anti-patterns → all saved to
  //     the "Knowledge Base" Google Sheet tab and injected into future prompts.
  try {
    await extractKnowledgeFromMonitor(diffs, ai, weekLabel);
    logger.info({ week: weekLabel }, "monitor: knowledge base updated");
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "monitor: knowledge extraction failed (non-fatal)",
    );
  }

  // 5. Resolve the Google Sheet URL so the Slack message can link to full data
  let sheetUrl: string | undefined;
  try {
    const health = await sheetsHealthCheck();
    if (health.ok) sheetUrl = health.url;
  } catch {
    // non-fatal — message just won't include the sheet link
  }

  // 6. Generate the visual Google Doc report (full HTML with embedded images)
  let reportDocUrl: string | undefined;
  try {
    const html = renderWeeklyDocHtml(diffs, ai, weekLabel, sheetUrl);
    const filename = `Competitor Intel — ${weekLabel}`;
    const upload = await driveUploadAsGoogleDoc(filename, html);
    if (upload.ok && upload.link) {
      reportDocUrl = upload.link;
      logger.info({ url: reportDocUrl }, "monitor: weekly doc generated");
    } else {
      logger.warn({ error: upload.error }, "monitor: doc upload failed (non-fatal)");
    }
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "monitor: doc generation failed (non-fatal)",
    );
  }

  // 7. Generate the Google Slides presentation (visual deck for team sharing)
  let reportSlidesUrl: string | undefined;
  try {
    const slidesResult = await createWeeklySlidesPresentation(diffs, ai, weekLabel);
    if (slidesResult.ok && slidesResult.link) {
      reportSlidesUrl = slidesResult.link;
      logger.info({ url: reportSlidesUrl }, "monitor: weekly slides presentation generated");
    } else {
      logger.warn({ error: slidesResult.error }, "monitor: slides generation failed (non-fatal)");
    }
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "monitor: slides generation failed (non-fatal)",
    );
  }

  // 8. Slack — narrative, human-readable format with links to Slides + Doc + Sheet
  const blocks = formatSlackBlocks(diffs, ai, weekLabel, sheetUrl, reportDocUrl, reportSlidesUrl);
  let slackPosted = false;
  if (opts.postToSlack !== false) {
    await postToSlack(blocks, ai.headline || `Competitor Intel — ${weekLabel}`);
    slackPosted = true;
  }

  lastRunDay = today;
  return {
    week: weekLabel,
    competitors_scraped: thisWeek.length,
    diffs,
    ai,
    slack_posted: slackPosted,
    report_doc_url: reportDocUrl,
    report_slides_url: reportSlidesUrl,
    sheet_url: sheetUrl,
  };
}

/* Scheduler — checks every hour if it's time to run. */
export function startMonitorScheduler(): void {
  ensureDir(SNAPSHOTS_DIR);
  logger.info({ competitors: TRACKED }, "monitor: scheduler started — Sunday 09:00 UTC");

  setInterval(() => {
    if (!shouldRunNow()) return;
    runMonitorOnce().catch((err) =>
      logger.error(
        { err: err instanceof Error ? err.message : String(err) },
        "monitor: scheduled run failed",
      ),
    );
  }, CHECK_INTERVAL_MS);
}
