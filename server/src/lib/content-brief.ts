/**
 * Content Brief — what's live right now so agents never duplicate angles.
 *
 * Monthly fields: campaign, sector focus, product focus, ZATCA wave,
 *                 active channels, budget channels
 * Weekly fields:  top hooks, bottom hooks, key insight
 *
 * Stored in Google Sheets "Content Brief" tab so it survives Railway re-deploys.
 * 30-min in-memory cache; invalidated immediately after every write.
 */

import { sheetsGetBriefJson, sheetsSetBriefJson } from "./sheets-client.js";
import { logger } from "./logger.js";

export interface ContentBrief {
  updated_monthly: string;
  updated_weekly: string;
  monthly: {
    campaign: string;
    sector_focus: string;
    zatca_wave: string;
    product_focus: string;
    active_channels: string[];
    budget_channels: string[];
  };
  weekly: {
    top_hooks: string[];
    bottom_hooks: string[];
    key_insight: string;
  };
}

let _cache: { brief: ContentBrief; ts: number } | null = null;
const CACHE_TTL_MS = 30 * 60 * 1_000;

export async function getContentBrief(): Promise<ContentBrief | null> {
  if (_cache && Date.now() - _cache.ts < CACHE_TTL_MS) return _cache.brief;
  try {
    const json = await sheetsGetBriefJson();
    if (!json) return null;
    const brief = JSON.parse(json) as ContentBrief;
    _cache = { brief, ts: Date.now() };
    return brief;
  } catch (e) {
    logger.warn({ err: String(e) }, "content-brief: read failed (non-fatal)");
    return null;
  }
}

export async function setContentBrief(brief: ContentBrief): Promise<void> {
  await sheetsSetBriefJson(JSON.stringify(brief));
  _cache = { brief, ts: Date.now() };
  logger.info("content-brief: saved");
}

export function invalidateContentBriefCache(): void {
  _cache = null;
}

export async function getContentBriefSnippet(): Promise<string> {
  const brief = await getContentBrief();
  if (!brief) return "";

  const m = brief.monthly;
  const w = brief.weekly;
  const lines: string[] = [];

  if (m.campaign)                lines.push(`• الحملة الحالية: ${m.campaign}`);
  if (m.sector_focus)            lines.push(`• القطاع المستهدف: ${m.sector_focus}`);
  if (m.product_focus)           lines.push(`• التركيز على المنتج: ${m.product_focus}`);
  if (m.zatca_wave)              lines.push(`• موجة ZATCA الحالية: ${m.zatca_wave}`);
  if (m.active_channels.length)  lines.push(`• القنوات النشطة: ${m.active_channels.join("، ")}`);
  if (m.budget_channels.length)  lines.push(`• إعلانات مدفوعة على: ${m.budget_channels.join("، ")} — لا تكرر نفس الزاوية هناك`);
  if (w.top_hooks.length)        lines.push(`• ما نجح هذا الأسبوع: "${w.top_hooks.join('" · "')}"`);
  if (w.bottom_hooks.length)     lines.push(`• ما لم ينجح هذا الأسبوع: "${w.bottom_hooks.join('" · "')}"`);
  if (w.key_insight)             lines.push(`• ملاحظة الأسبوع: ${w.key_insight}`);

  if (lines.length === 0) return "";

  const updated = brief.updated_monthly || brief.updated_weekly || "";
  return `\n## ملخص الحملة الحالية${updated ? ` (${updated})` : ""}:\n${lines.join("\n")}\n← ما يُكتب الآن يجب أن يكمّل ما يُعرض على القنوات — لا يتعارض معه.\n`;
}
