/**
 * Paid Media Analyst — weekly owned-content performance review.
 *
 * Runs every Sunday alongside the competitor monitor (09:00 UTC).
 * Fetches the last 7 days of published HubSpot social posts, asks the
 * content_creator persona to review performance, and saves the result
 * as a task (visible in the dashboard activity feed).
 */

import { logger } from "./logger.js";
import { spawnTask } from "../routes/agent.js";

const HS_TOKEN = () => process.env.HS_ACCESS_TOKEN ?? "";

interface BroadcastRecord {
  broadcastGuid: string;
  channelKey: string;
  finishedAt: number;
  content?: { body?: string; title?: string };
  statistics?: {
    clicks?: number;
    impressions?: number;
    reach?: number;
    reactions?: number;
    shares?: number;
  };
}

async function fetchWeekPosts(): Promise<BroadcastRecord[]> {
  const token = HS_TOKEN();
  if (!token) return [];
  try {
    const r = await fetch(
      "https://api.hubapi.com/broadcast/v1/broadcasts?status=SUCCESS&limit=50",
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!r.ok) return [];
    const data = await r.json() as BroadcastRecord[];
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1_000;
    return (Array.isArray(data) ? data : []).filter(b => b.finishedAt >= weekAgo);
  } catch {
    return [];
  }
}

function platformFromKey(key: string): string {
  const low = key.toLowerCase();
  if (low.startsWith("instagram"))   return "Instagram";
  if (low.startsWith("facebookpage") || low.startsWith("facebook")) return "Facebook";
  if (low.startsWith("linkedin"))    return "LinkedIn";
  if (low.startsWith("tiktok"))      return "TikTok";
  if (low.startsWith("twitter"))     return "Twitter/X";
  if (low.startsWith("youtube"))     return "YouTube";
  return key.split(":")[0] ?? key;
}

function buildReviewPrompt(posts: BroadcastRecord[], weekLabel: string): string {
  if (posts.length === 0) {
    return `Weekly paid media review — ${weekLabel}: No posts were published this week. Recommend next steps.`;
  }

  const lines = posts.map(b => {
    const platform = platformFromKey(b.channelKey);
    const text = (b.content?.body || b.content?.title || "").slice(0, 120);
    const s = b.statistics ?? {};
    const stats = [
      s.impressions != null ? `${s.impressions} impressions` : null,
      s.reach       != null ? `${s.reach} reach`             : null,
      s.reactions   != null ? `${s.reactions} reactions`     : null,
      s.clicks      != null ? `${s.clicks} clicks`           : null,
    ].filter(Boolean).join(", ");
    return `- [${platform}] "${text}"${stats ? ` → ${stats}` : ""}`;
  }).join("\n");

  return `Weekly paid media review — ${weekLabel}

You are the Paid Media Analyst for Qoyod. Review this week's ${posts.length} published organic posts and provide:
1. Top 2-3 performing posts and WHY they worked (engagement signals)
2. Bottom 2-3 underperformers and what to change
3. Channel-level summary: which platform had the best week
4. One counter-creative recommendation based on patterns vs competitors
5. Recommended focus for NEXT week (content type + platform)

Published posts this week:
${lines}

Write in Arabic. Be specific and actionable — this goes directly to the creative team.`;
}

function weekLabel(): string {
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - 6);
  const fmt = (d: Date) => d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  return `${fmt(start)} – ${fmt(now)}`;
}

export async function runPaidMediaWeeklyReview(): Promise<void> {
  logger.info("paid-media-review: starting weekly review");
  try {
    const posts = await fetchWeekPosts();
    const label = weekLabel();
    logger.info({ postCount: posts.length, week: label }, "paid-media-review: fetched posts");

    const task = spawnTask(
      {
        source: "task",
        actor: "scheduler:paid_media_weekly",
        title: `Weekly performance review — ${label}`,
        body: buildReviewPrompt(posts, label),
        context: { persona: "content_creator", week: label, postCount: posts.length },
      },
      { priority: "normal", persona: "content_creator" },
    );

    if (task) {
      logger.info({ task_id: task.id }, "paid-media-review: task spawned");
    } else {
      logger.warn("paid-media-review: task was duplicate-skipped");
    }
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : String(err) },
      "paid-media-review: failed",
    );
  }
}
