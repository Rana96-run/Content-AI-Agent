/**
 * Customer Voice Loader
 *
 * Pulls real customer pain language from public review sources + social
 * mentions, synthesizes into a SHORT (~1200 char) markdown brief, and
 * makes it injectable into Content/Campaign prompts.
 *
 * Sources (all free / public):
 *   1. Apple App Store — Qoyod app reviews (RSS feed, no auth)
 *   2. Twitter/X mentions of "قيود" / "Qoyod" via Apify (when budget allows)
 *   3. Trustpilot — if Qoyod has a profile
 *
 * Why: Master prompt §3.5 — "Read 1 customer review per day." This automates
 * that and feeds raw quotes into prompts so generated copy uses real pain
 * language instead of generic marketing-speak.
 *
 * Storage: server/data/customer-voice.md
 * Refresh: daily (every 24h, gated by file mtime)
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { logger } from "./logger.js";
import { sheetsLogActivity } from "./sheets-client.js";

const VOICE_PATH = path.resolve(process.cwd(), "server/data/customer-voice.md");
const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1_000; // 24h
const MAX_CHARS = 1500;

// Configurable via env — defaults for Qoyod's known stores
const APP_STORE_ID = process.env.APP_STORE_APP_ID || ""; // numeric Apple App Store ID
const APP_STORE_COUNTRY = process.env.APP_STORE_COUNTRY || "sa"; // Saudi Arabia
const PLAY_STORE_ID = process.env.PLAY_STORE_APP_ID || ""; // package name e.g. com.qoyod.app

interface ReviewItem {
  source: string;
  rating?: number;
  title?: string;
  body: string;
  author?: string;
  date?: string;
}

/* ─── Apple App Store (RSS feed — no auth needed) ─────────────────────── */
async function fetchAppStoreReviews(appId: string, country = "sa"): Promise<ReviewItem[]> {
  if (!appId) return [];
  // Public RSS endpoint, no auth required, returns last 50 reviews
  const url = `https://itunes.apple.com/${country}/rss/customerreviews/id=${appId}/sortBy=mostRecent/json`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!r.ok) return [];
    const j = (await r.json()) as { feed?: { entry?: any[] } };
    const entries = (j.feed?.entry || []).slice(1); // first entry is metadata
    return entries.slice(0, 15).map((e: any) => ({
      source: "App Store",
      rating: parseInt(e["im:rating"]?.label || "0"),
      title: e.title?.label,
      body: e.content?.label || "",
      author: e.author?.name?.label,
      date: e.updated?.label,
    }));
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "customer-voice: app store fetch failed",
    );
    return [];
  }
}

/* ─── Google Play Store via jina reader ───────────────────────────────── */
async function fetchPlayStoreReviews(packageName: string): Promise<ReviewItem[]> {
  if (!packageName) return [];
  const target = `https://play.google.com/store/apps/details?id=${packageName}&hl=ar&gl=SA&showAllReviews=true`;
  try {
    const r = await fetch(`https://r.jina.ai/${target}`, {
      headers: { Accept: "text/plain" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) return [];
    const text = await r.text();
    // Heuristic: extract review-like lines (long paragraphs, often Arabic)
    const reviewLines = text
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 40 && l.length < 400)
      .filter((l) => /[؀-ۿ]/.test(l)) // contains Arabic
      .slice(0, 10);
    return reviewLines.map((body) => ({ source: "Play Store", body }));
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "customer-voice: play store fetch failed",
    );
    return [];
  }
}

/* ─── X/Twitter mentions via Apify (optional, costs ~$0.01) ───────────── */
async function fetchTwitterMentions(): Promise<ReviewItem[]> {
  const token = process.env.APIFY_TOKEN;
  if (!token) return [];
  // Actor: apidojo/tweet-scraper — light, fast
  const actor = "apidojo~tweet-scraper";
  const url = `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}&timeout=60`;
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        searchTerms: ["قيود محاسبة", "Qoyod"],
        tweetsDesired: 15,
        sort: "Latest",
      }),
      signal: AbortSignal.timeout(70_000),
    });
    if (!r.ok) return [];
    const items = (await r.json()) as any[];
    return (items || []).slice(0, 10).map((t) => ({
      source: "X/Twitter",
      body: t.text || t.full_text || "",
      author: t.user?.userName || t.author?.userName,
      date: t.createdAt,
    }));
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "customer-voice: twitter scrape failed",
    );
    return [];
  }
}

/* ─── Synthesize raw reviews into a content-team-friendly brief ────── */
async function synthesizeVoice(
  items: ReviewItem[],
  callAI: (system: string, user: string, max: number) => Promise<any>,
): Promise<{ summary: string; pains: string[]; quotes: string[] } | null> {
  if (items.length === 0) return null;

  const corpus = items
    .map((i, idx) => `[${idx + 1}] ${i.source} (${i.rating ? `${i.rating}/5` : ""}): ${i.body.slice(0, 250)}`)
    .join("\n");

  const system = `You read raw customer reviews and X mentions of Qoyod (Saudi cloud accounting SaaS).
Distill them into copy-team material. Saudi Arabic dialect. No marketing speak.

Return ONLY valid JSON:
{
  "summary": "جملتين عن أبرز ما يقوله العملاء هذا الأسبوع",
  "pains": ["3-5 painful customer phrases (verbatim from corpus, max 80 chars each)"],
  "quotes": ["2-3 strongest verbatim quotes worth turning into hooks"]
}`;

  try {
    const r = await callAI(system, corpus.slice(0, 6000), 1500);
    return r;
  } catch {
    return null;
  }
}

function renderMarkdown(
  voice: { summary: string; pains: string[]; quotes: string[] },
  generated: string,
): string {
  return [
    `<!-- Generated: ${generated} -->`,
    ``,
    `# صوت العميل — آخر تحديث`,
    ``,
    `## الملخص`,
    voice.summary,
    ``,
    `## نقاط الألم الأقوى (لاستخدامها كهوكات)`,
    ...voice.pains.map((p) => `- "${p}"`),
    ``,
    `## اقتباسات حرفية`,
    ...voice.quotes.map((q) => `> ${q}`),
  ]
    .join("\n")
    .slice(0, MAX_CHARS);
}

/* ─── Public API ──────────────────────────────────────────────────────── */

export async function refreshCustomerVoice(
  callAI: (system: string, user: string, max: number) => Promise<any>,
): Promise<{ ok: boolean; sources: number; items_seen: number; error?: string }> {
  try {
    fs.mkdirSync(path.dirname(VOICE_PATH), { recursive: true });

    // Fetch all sources in parallel
    const [appStore, playStore, twitter] = await Promise.all([
      fetchAppStoreReviews(APP_STORE_ID, APP_STORE_COUNTRY),
      fetchPlayStoreReviews(PLAY_STORE_ID),
      fetchTwitterMentions(),
    ]);

    const all = [...appStore, ...playStore, ...twitter];
    if (all.length === 0) {
      return {
        ok: false,
        sources: 0,
        items_seen: 0,
        error:
          "No reviews fetched. Set APP_STORE_APP_ID / PLAY_STORE_APP_ID env vars, or check Apify token.",
      };
    }

    const voice = await synthesizeVoice(all, callAI);
    if (!voice) {
      return { ok: false, sources: all.length, items_seen: all.length, error: "AI synthesis failed" };
    }

    const md = renderMarkdown(voice, new Date().toISOString());
    fs.writeFileSync(VOICE_PATH, md, "utf-8");
    sheetsLogActivity("customer_voice", `Voice refreshed — ${all.length} items from ${3} sources`, all.length).catch(() => {});
    logger.info(
      { sources: 3, items: all.length, chars: md.length },
      "customer-voice: refreshed",
    );
    return { ok: true, sources: 3, items_seen: all.length };
  } catch (err) {
    return {
      ok: false,
      sources: 0,
      items_seen: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Read the cached voice doc for prompt injection. Auto-skips if stale (>14 days). */
export function getCustomerVoiceSnippet(): string {
  try {
    const stat = fs.statSync(VOICE_PATH);
    const ageMs = Date.now() - stat.mtimeMs;
    if (ageMs > 14 * 24 * 60 * 60 * 1_000) return "";
    const text = fs.readFileSync(VOICE_PATH, "utf-8").replace(/^<!--[\s\S]*?-->\s*/, "");
    return `\n\n--- CUSTOMER VOICE (real pain quotes — use as inspiration) ---\n${text}\n--- END VOICE ---\n`;
  } catch {
    return "";
  }
}

/** Background refresher — fires on interval if file is older than threshold */
export function startVoiceRefresher(
  callAI: (system: string, user: string, max: number) => Promise<any>,
): void {
  const tick = async () => {
    try {
      const stat = fs.statSync(VOICE_PATH);
      if (Date.now() - stat.mtimeMs < REFRESH_INTERVAL_MS) return;
    } catch {
      // file doesn't exist yet → refresh
    }
    await refreshCustomerVoice(callAI).catch(() => {});
  };
  // Initial run after 30s (let server warm up), then every hour
  setTimeout(tick, 30_000);
  setInterval(tick, 60 * 60 * 1_000);
  logger.info("customer-voice: refresher started (24h cadence)");
}
