/**
 * Knowledge Base — The System's Long-Term Memory
 *
 * Every time the weekly competitor monitor runs, Claude extracts NEW
 * structured insights from the data and appends them to a persistent
 * Google Sheet tab ("Knowledge Base"). Over time this sheet becomes a
 * living, growing intelligence layer that reflects:
 *
 *   - New ICP signals discovered from competitor targeting
 *   - Proven ad hooks (angles running >4 weeks = likely profitable)
 *   - Content format trends in the Saudi SME/accounting category
 *   - Sector-specific patterns (F&B, Retail, Consulting, etc.)
 *   - Anti-patterns — what's declining / what to avoid
 *
 * This is injected into every content generation prompt alongside
 * Brand Law + Competitor Context + Customer Voice + Pattern Library.
 * The difference: the others are fresh snapshots. This one COMPOUNDS.
 *
 * Cache: 30min in-memory (same TTL as pattern library).
 */

import { sheetsAppendKnowledge, sheetsReadKnowledge } from "./sheets-client.js";
import { logger } from "./logger.js";

export type KnowledgeType =
  | "icp_signal"       // new customer segment or persona discovered
  | "ad_pattern"       // structural ad pattern proven in the market
  | "hook_angle"       // specific hook angle working right now
  | "content_insight"  // content format / type trend
  | "sector_insight"   // sector-specific pattern (F&B, Retail, etc.)
  | "anti_pattern"     // what's declining or failing — avoid
  | "competitor_move"; // notable competitor strategic shift

export interface KnowledgeEntry {
  week: string;             // "May 22, 2026"
  type: KnowledgeType;
  sector: string;           // "Retail" | "F&B" | "All" | etc.
  channel: string;          // "Meta" | "TikTok" | "All" | etc.
  insight: string;          // The actual insight (max 200 chars, Arabic or English)
  source: string;           // "competitor:Daftra" | "hypothesis:WIN" | "market"
  confidence: "high" | "medium" | "low";
  added_at: string;         // ISO timestamp
}

// ── Cache ─────────────────────────────────────────────────────────────────────
const CACHE_TTL_MS = 30 * 60 * 1_000;
let cache: { ts: number; snippet: string } | null = null;

export function bustKnowledgeCache(): void {
  cache = null;
}

// ── Format knowledge as a prompt-injectable snippet ───────────────────────────
function format(entries: KnowledgeEntry[]): string {
  if (entries.length === 0) return "";

  const grouped: Partial<Record<KnowledgeType, KnowledgeEntry[]>> = {};
  for (const e of entries) {
    if (!grouped[e.type]) grouped[e.type] = [];
    grouped[e.type]!.push(e);
  }

  const labels: Record<KnowledgeType, string> = {
    icp_signal:       "ICP Signals (new customer profiles discovered)",
    ad_pattern:       "Proven Ad Patterns (running >4 weeks in market)",
    hook_angle:       "Hook Angles Working Right Now",
    content_insight:  "Content Format Insights",
    sector_insight:   "Sector-Specific Patterns",
    anti_pattern:     "Anti-Patterns (what to avoid)",
    competitor_move:  "Notable Competitor Moves",
  };

  const sections: string[] = [];
  const order: KnowledgeType[] = [
    "icp_signal", "ad_pattern", "hook_angle",
    "content_insight", "sector_insight", "competitor_move", "anti_pattern",
  ];

  for (const type of order) {
    const items = grouped[type];
    if (!items || items.length === 0) continue;
    sections.push(`### ${labels[type]}`);
    for (const e of items) {
      const meta = [
        e.sector !== "All" ? e.sector : null,
        e.channel !== "All" ? e.channel : null,
        e.confidence === "high" ? "✓ proven" : null,
      ].filter(Boolean).join(" · ");
      sections.push(`- ${e.insight}${meta ? ` (${meta})` : ""}`);
    }
  }

  return `\n\n--- ACCUMULATED KNOWLEDGE BASE (${entries.length} insights, compounding since first run) ---\n${sections.join("\n")}\n--- END KNOWLEDGE BASE ---\nBuild on these patterns. Don't reinvent what already works. Don't repeat what has failed.\n`;
}

// ── Public: get snippet for prompt injection ──────────────────────────────────
export async function getKnowledgeSnippet(): Promise<string> {
  if (cache && Date.now() - cache.ts < CACHE_TTL_MS) return cache.snippet;
  try {
    const raw = await sheetsReadKnowledge(40); // last 40 entries across all types
    const entries = raw as KnowledgeEntry[];
    const snippet = format(entries);
    cache = { ts: Date.now(), snippet };
    return snippet;
  } catch {
    return "";
  }
}

// ── Claude call (reuses same pattern as competitor-monitor.ts) ────────────────
async function callClaude(system: string, user: string): Promise<any> {
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
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
      max_tokens: 2000,
      system,
      messages: [
        { role: "user", content: user },
        { role: "assistant", content: "[" },
      ],
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!r.ok) throw new Error(`Claude ${r.status}`);
  const data = (await r.json()) as any;
  const text = "[" + (data.content?.[0]?.text || "");
  return JSON.parse(text);
}

// ── Core: extract new knowledge from a weekly monitor run ────────────────────
export async function extractKnowledgeFromMonitor(
  diffs: Array<{
    competitor: string;
    facebook_new: number;
    google_new: number;
    instagram_new_posts: number;
    notable_angles: string[];
    proven_winners?: string[];
    disappeared_ads?: string[];
  }>,
  ai: {
    headline?: string;
    competitors?: Array<{ name: string; summary: string }>;
    recommended_actions?: string[];
  },
  weekLabel: string,
): Promise<void> {
  const system = `You are the self-learning engine for Qoyod's Creative OS.

Your job: extract NEW, specific, actionable insights from this week's competitor data.
"New" means insights that a content team would not already know from general best practices.
Focus on signals that are specific to the Saudi accounting/SaaS/SME market.

Return ONLY a valid JSON array of 5-10 insight objects. Each object:
{
  "type": "icp_signal" | "ad_pattern" | "hook_angle" | "content_insight" | "sector_insight" | "anti_pattern" | "competitor_move",
  "sector": "Retail" | "F&B" | "Consulting" | "Construction" | "Tech" | "All",
  "channel": "Meta" | "TikTok" | "LinkedIn" | "Google" | "YouTube" | "Snapchat" | "All",
  "insight": "Specific actionable insight in max 180 chars. Arabic or English.",
  "source": "competitor:Name" | "market" | "cross-competitor",
  "confidence": "high" | "medium" | "low"
}

Confidence guide:
- high = pattern seen across 2+ competitors OR running >4 weeks
- medium = single competitor, 1-3 weeks
- low = directional signal, needs confirmation

Extract insights in these categories (not all need to be covered each week, only if evidence exists):
- icp_signal: What customer segments are competitors targeting that we haven't mined yet? New personas?
- ad_pattern: What structural ad patterns are being used? (before/after, fear+relief, number-led, UGC-style)
- hook_angle: Specific hooks or openings that appear repeatedly = proven scroll-stopper
- content_insight: What content formats/types are getting engagement? (carousel > static? video > image?)
- sector_insight: Sector-specific signals (e.g. F&B competitors pushing multi-branch, Retail pushing inventory angle)
- anti_pattern: What angles appear to have been dropped or are declining?
- competitor_move: Notable strategic shift (new product angle, new audience, pricing message)

IMPORTANT: Output only the JSON array. No markdown, no explanation. Start directly with [`;

  const user = `Week: ${weekLabel}

Competitor activity:
${diffs.map((d) => `
${d.competitor}:
  New ads: ${d.facebook_new} Facebook, ${d.google_new} Google, ${d.instagram_new_posts} Instagram posts
  Proven winners (running >30 days): ${(d.proven_winners || []).length > 0 ? (d.proven_winners || []).join("; ") : "none captured"}
  Hooks/angles seen this week:
${(d.notable_angles || []).map((a) => `    - "${a}"`).join("\n") || "    (none captured)"}
  Disappeared ads (stopped running):
${(d.disappeared_ads || []).length > 0 ? (d.disappeared_ads || []).map((a) => `    - "${a}"`).join("\n") : "    (none captured)"}
`).join("\n")}

AI summary: ${ai.headline || ""}
Key actions recommended: ${(ai.recommended_actions || []).join("; ") || "none"}`;

  const raw = await callClaude(system, user);
  if (!Array.isArray(raw) || raw.length === 0) {
    logger.warn({ raw }, "knowledge-base: Claude returned no insights");
    return;
  }

  const entries: KnowledgeEntry[] = raw
    .filter((e: any) => e.type && e.insight)
    .map((e: any): KnowledgeEntry => ({
      week: weekLabel,
      type: e.type as KnowledgeType,
      sector: e.sector || "All",
      channel: e.channel || "All",
      insight: String(e.insight).slice(0, 200),
      source: e.source || "market",
      confidence: e.confidence || "medium",
      added_at: new Date().toISOString(),
    }));

  if (entries.length === 0) return;

  await sheetsAppendKnowledge(entries);
  bustKnowledgeCache();
  logger.info({ count: entries.length, week: weekLabel }, "knowledge-base: extracted and saved");
}
