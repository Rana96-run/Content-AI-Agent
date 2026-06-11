/**
 * Weekly Digest
 *
 * Once a week, summarize past 7 days of social activity, generate 3
 * structured recommendations, AUTO-CREATE a design (SVG ad) for each
 * recommendation, save to Drive, and post a single Slack message
 * with the digest + design links. No emojis. English only.
 *
 * Schedule: Sunday 09:00 UTC. Manual trigger: POST /api/agent/weekly-digest/run-now
 */

import { listEntries, listCompetitorPosts } from "./content-library.js";
import { driveUploadText } from "../routes/drive.js";
import { canvaUploadSvgAndCreateDesign } from "../routes/canva.js";
import { logger } from "./logger.js";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5";

const ONE_DAY = 24 * 60 * 60 * 1_000;
const CHECK_INTERVAL_MS = 60 * 60 * 1_000;
let lastSentDay: string | null = null;

function dayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}
function shouldRunNow(): boolean {
  const now = new Date();
  if (now.getUTCDay() !== 0) return false;
  if (now.getUTCHours() !== 9) return false;
  if (lastSentDay === dayKey(now)) return false;
  return true;
}

interface DigestStats {
  total: number;
  by_channel: Record<string, number>;
  by_type: Record<string, number>;
  by_topic: Record<string, number>;
  topics_sample: string[];
  competitors_seen: number;
  competitor_top_topic?: string;
}

function buildStats(): DigestStats {
  const since = Date.now() - 7 * ONE_DAY;
  const recent = listEntries({ limit: 500 }).filter(
    (e) => Date.parse(e.published_at) > since,
  );
  const byChannel: Record<string, number> = {};
  const byType:    Record<string, number> = {};
  const byTopic:   Record<string, number> = {};
  for (const e of recent) {
    byChannel[e.channel] = (byChannel[e.channel] ?? 0) + 1;
    byType[e.type]       = (byType[e.type] ?? 0) + 1;
    if (e.topic) byTopic[e.topic] = (byTopic[e.topic] ?? 0) + 1;
  }
  const compRecent = listCompetitorPosts(undefined, 200).filter(
    (p) => Date.parse(p.fetched_at) > since,
  );
  // CompetitorPost has no `topic` field — derive a coarse "channel" signal instead.
  const compTopics: Record<string, number> = {};
  for (const p of compRecent) {
    if (p.channel) compTopics[p.channel] = (compTopics[p.channel] ?? 0) + 1;
  }
  const topCompTopic = Object.entries(compTopics).sort((a, b) => b[1] - a[1])[0]?.[0];

  return {
    total: recent.length,
    by_channel: byChannel,
    by_type: byType,
    by_topic: byTopic,
    topics_sample: Object.keys(byTopic).slice(0, 6),
    competitors_seen: compRecent.length,
    competitor_top_topic: topCompTopic,
  };
}

/* ── Recommendation = structured spec the design pipeline can execute ── */
interface Recommendation {
  title: string;            // 1-line English headline of the recommendation
  rationale: string;        // 1 short sentence, why
  channel: string;          // Instagram / LinkedIn / TikTok / X / Snapchat
  ratio: "1:1" | "4:5" | "9:16" | "16:9";
  scheme: "navy" | "teal" | "ocean" | "light" | "midnight" | "slate";
  product: string;          // Qoyod Main / QFlavours / QoyodPOS / VAT / E-Invoice / API
  message: string;          // Arabic Saudi-dialect headline (2-4 words)
  hook: string;             // Arabic 6-10 words
  cta: string;              // Arabic 2-3 words
  trust: string;            // Arabic, max 4 words
}

interface DigestPlan {
  recommendations: Recommendation[];
}

async function generatePlan(stats: DigestStats): Promise<DigestPlan> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { recommendations: [] };

  const sys = `You are a senior social media strategist for Qoyod (Saudi ZATCA-certified cloud accounting). Read weekly stats and produce 3 SPECIFIC, actionable recommendations as STRUCTURED JSON. No emojis. Each recommendation must include exact design specs the design pipeline can execute. The Arabic copy must be Saudi dialect (مو/وش/ليش — never Egyptian). Pick a different channel + ratio + colour scheme for each recommendation when possible. Return ONLY valid JSON, no markdown, no preamble.`;

  const usr = `Past 7 days stats:
${JSON.stringify(stats, null, 2)}

Output JSON shape:
{
  "recommendations": [
    {
      "title": "1-line English headline (what + where + why)",
      "rationale": "1 short English sentence explaining the data signal",
      "channel": "Instagram | LinkedIn | TikTok | Twitter/X | Snapchat",
      "ratio": "1:1 | 4:5 | 9:16 | 16:9",
      "scheme": "navy | teal | ocean | light | midnight | slate",
      "product": "Qoyod Main | QFlavours | QoyodPOS | QBookkeeping | VAT | E-Invoice (ZATCA Ph2) | API Integration",
      "message": "2-4 Arabic words — the hero headline",
      "hook": "6-10 Arabic words — supporting line",
      "cta": "2-3 Arabic words for the CTA button",
      "trust": "max 4 Arabic words — trust badge"
    },
    { ... },
    { ... }
  ]
}

Ratio guide: Instagram post=1:1, Instagram portrait=4:5, Stories/Reels/TikTok=9:16, LinkedIn banner/YouTube=16:9.

Return exactly 3 recommendations. JSON only.`;

  try {
    const r = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1500,
        system: sys,
        messages: [{ role: "user", content: usr }],
      }),
    });
    const data = (await r.json()) as { content?: Array<{ text?: string }> };
    const raw = (data.content?.[0]?.text ?? "").trim();
    const clean = raw.replace(/```json\n?|\n?```/g, "").trim();
    const fi = clean.indexOf("{");
    const li = clean.lastIndexOf("}");
    return JSON.parse(clean.slice(fi, li + 1)) as DigestPlan;
  } catch (e) {
    logger.warn({ err: String(e) }, "weekly-digest: plan parse failed");
    return { recommendations: [] };
  }
}

/* ── Per-recommendation: render SVG + save to Drive (+ Canva if connected) ── */
interface DesignResult {
  rec: Recommendation;
  drive_link?: string;
  canva_edit_url?: string;
  error?: string;
}

async function buildDesignForRec(rec: Recommendation): Promise<DesignResult> {
  const baseUrl =
    process.env.PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? "8080"}`;
  try {
    const r = await fetch(`${baseUrl}/api/generate-design`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        product: rec.product,
        message: rec.message,
        hook: rec.hook,
        cta: rec.cta,
        trust: rec.trust,
        ratio: rec.ratio,
        color_scheme: rec.scheme,
      }),
    });
    const d = (await r.json()) as { svg?: string; error?: string };
    if (!r.ok || !d.svg) return { rec, error: d.error ?? `HTTP ${r.status}` };

    const safeTitle = rec.title.replace(/[^\w\s-]/g, "").slice(0, 40).trim().replace(/\s+/g, "-");
    const fname = `weekly-${dayKey()}-${rec.channel.toLowerCase()}-${safeTitle}.svg`;

    const out: DesignResult = { rec };

    // Save SVG to Drive
    const drv = await driveUploadText(fname, d.svg, "image/svg+xml", "Weekly Digests");
    if (drv.ok && drv.link) out.drive_link = drv.link;

    // Try Canva (best-effort; may be disconnected)
    try {
      const canva = await canvaUploadSvgAndCreateDesign(d.svg, rec.title);
      if (canva.edit_url) out.canva_edit_url = canva.edit_url;
    } catch { /* ignore Canva failures */ }

    return out;
  } catch (e) {
    return { rec, error: e instanceof Error ? e.message : String(e) };
  }
}

/* ── Slack formatting ── */
function formatDigest(
  stats: DigestStats,
  designs: DesignResult[],
): string {
  const L: string[] = [];
  L.push(`*Qoyod Weekly Social Digest — ${dayKey()}*`);
  L.push("");
  L.push(`Total posts published: ${stats.total}`);
  L.push("");
  if (Object.keys(stats.by_channel).length) {
    L.push("By platform:");
    for (const [ch, n] of Object.entries(stats.by_channel).sort((a, b) => b[1] - a[1])) {
      L.push(`  ${ch}: ${n}`);
    }
    L.push("");
  }
  if (Object.keys(stats.by_type).length) {
    L.push("By content type:");
    for (const [t, n] of Object.entries(stats.by_type).sort((a, b) => b[1] - a[1])) {
      L.push(`  ${t}: ${n}`);
    }
    L.push("");
  }
  if (stats.topics_sample.length) {
    L.push(`Topics covered: ${stats.topics_sample.join(", ")}`);
    L.push("");
  }
  L.push(
    `Competitor posts tracked this week: ${stats.competitors_seen}` +
    (stats.competitor_top_topic ? ` (most active topic: ${stats.competitor_top_topic})` : ""),
  );
  L.push("");
  L.push("*Recommendations + auto-generated designs:*");
  designs.forEach((d, i) => {
    const n = i + 1;
    L.push("");
    L.push(`${n}. ${d.rec.title}`);
    L.push(`   Why: ${d.rec.rationale}`);
    L.push(`   Spec: ${d.rec.channel} / ${d.rec.ratio} / ${d.rec.scheme} / ${d.rec.product}`);
    if (d.drive_link)     L.push(`   Drive: ${d.drive_link}`);
    if (d.canva_edit_url) L.push(`   Canva: ${d.canva_edit_url}`);
    if (d.error)          L.push(`   Note: design failed (${d.error})`);
  });
  return L.join("\n");
}

async function postToSlack(text: string): Promise<boolean> {
  const token = process.env.SLACK_BOT_TOKEN;
  const channel = process.env.SLACK_DEFAULT_CHANNEL;
  if (!token || !channel) {
    logger.info("weekly-digest: SLACK_BOT_TOKEN or SLACK_DEFAULT_CHANNEL missing — skipping");
    return false;
  }
  try {
    const r = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ channel, text }),
    });
    const data = (await r.json()) as { ok?: boolean; error?: string };
    if (!data.ok) {
      logger.warn({ err: data.error }, "weekly-digest: slack post failed");
      return false;
    }
    return true;
  } catch (e) {
    logger.warn({ err: String(e) }, "weekly-digest: slack post error");
    return false;
  }
}

/* ── Public API ────────────────────────────────────────────────── */
export async function runDigestNow(): Promise<{
  ok: boolean;
  text: string;
  designs: DesignResult[];
}> {
  logger.info("weekly-digest: building stats");
  const stats = buildStats();

  logger.info("weekly-digest: generating recommendations + design specs");
  const plan = await generatePlan(stats);

  logger.info(
    { count: plan.recommendations.length },
    "weekly-digest: generating designs",
  );
  const designs: DesignResult[] = [];
  for (const rec of plan.recommendations) {
    const d = await buildDesignForRec(rec);
    designs.push(d);
  }

  const text = formatDigest(stats, designs);
  const ok = await postToSlack(text);
  if (ok) lastSentDay = dayKey();
  logger.info({ ok, designs_built: designs.length }, "weekly-digest: complete");
  return { ok, text, designs };
}

let handle: NodeJS.Timeout | null = null;

export function startWeeklyDigest() {
  if (handle) return;
  handle = setInterval(() => {
    if (!shouldRunNow()) return;
    runDigestNow().catch((e) =>
      logger.error({ err: String(e) }, "weekly-digest: scheduled run failed"),
    );
  }, CHECK_INTERVAL_MS);
  if (handle?.unref) handle.unref();
  logger.info("weekly-digest: scheduler started (Sunday 09:00 UTC)");
}

export function stopWeeklyDigest() {
  if (handle) {
    clearInterval(handle);
    handle = null;
  }
}
