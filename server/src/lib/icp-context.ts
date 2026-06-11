/**
 * ICP Context — injects competitor ICP-targeting signals into every generate call.
 *
 * Daily capture extracts which customer archetype (P01–P10) each competitor
 * post targets, plus the pain hook they used. This file reads those signals
 * from Sheets and builds a compact prompt snippet showing:
 *   - Which ICPs competitors are actively targeting right now
 *   - With what pain angle
 *   - On which channel
 *
 * The snippet is injected as an extra context layer in generate.ts so every
 * piece of content knows what the competitive ICP landscape looks like today.
 */

import { sheetsGetICPSignals } from "./sheets-client.js";
import { logger } from "./logger.js";

// Mirrors client-side ICP_PERSONAS (P01–P10 in CreativeOS.jsx)
const ICP_TITLES: Record<string, string> = {
  P01: "CFO / مدير مالي",
  P02: "مؤسس / CEO — شركة صغيرة",
  P03: "مدير مالي",
  P04: "صاحب متجر إلكتروني",
  P05: "مدير العمليات",
  P06: "محاسب / مسك دفاتر",
  P07: "صاحب محل تجزئة",
  P08: "مستشار ضريبي",
  P09: "مستشار أعمال للـ SMEs",
  P10: "مؤسس شركة ناشئة",
};

let _cache: { snippet: string; ts: number } | null = null;
const CACHE_TTL_MS = 30 * 60 * 1_000; // 30 min

export async function getICPContextSnippet(): Promise<string> {
  if (_cache && Date.now() - _cache.ts < CACHE_TTL_MS) return _cache.snippet;

  try {
    const signals = await sheetsGetICPSignals(30);
    if (signals.length === 0) {
      _cache = { snippet: "", ts: Date.now() };
      return "";
    }

    // Group by ICP, sort by frequency (most targeted first)
    const byICP: Record<string, typeof signals> = {};
    for (const s of signals) {
      if (!s.icp_id) continue;
      (byICP[s.icp_id] = byICP[s.icp_id] || []).push(s);
    }

    const sorted = Object.entries(byICP)
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 4); // top 4 most-targeted archetypes

    if (sorted.length === 0) {
      _cache = { snippet: "", ts: Date.now() };
      return "";
    }

    const lines = sorted.map(([icpId, sigs]) => {
      const title = ICP_TITLES[icpId] || icpId;
      const competitors = [...new Set(sigs.map(s => s.competitor))].slice(0, 3).join("، ");
      const hooks = [...new Set(sigs.map(s => s.pain_hook).filter(Boolean))].slice(0, 2);
      const channels = [...new Set(sigs.map(s => s.channel).filter(Boolean))].slice(0, 2).join("/");
      const hookStr = hooks.length > 0 ? ` بزاوية "${hooks.join('" / "')}"` : "";
      return `• ${title} (${icpId}): ${competitors} يستهدفونها${hookStr} عبر ${channels || "سوشيال ميديا"} — ${sigs.length} إشارة`;
    });

    const snippet = `\n## إشارات ICP من تحليل المنافسين (آخر 30 يوم):\n${lines.join("\n")}\n← استخدم هذه الزوايا كمرجع لفهم ما يسمعه العميل من المنافسين — اكتب ردًا أحكم وأوضح.\n`;

    _cache = { snippet, ts: Date.now() };
    logger.info({ icpCount: sorted.length }, "icp-context: snippet built");
    return snippet;
  } catch (e) {
    logger.warn({ err: String(e) }, "icp-context: getICPContextSnippet failed (non-fatal)");
    return "";
  }
}

export function invalidateICPCache(): void {
  _cache = null;
}
