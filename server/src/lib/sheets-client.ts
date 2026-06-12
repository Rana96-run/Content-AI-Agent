/**
 * Google Sheets client for persistent content library storage.
 *
 * Uses the same service account as the Drive integration.
 * Env vars required:
 *   GOOGLE_SERVICE_ACCOUNT_JSON  — inline JSON (or GOOGLE_SERVICE_ACCOUNT_B64)
 *   GOOGLE_SHEETS_ID             — spreadsheet ID
 *
 * Sheet tabs:
 *   "Content Library"  — every Qoyod post saved by agents (upsert by ID)
 *   "Competitor Posts" — scraped competitor posts
 *   "Content Briefs"   — briefs submitted via Zapier sheets_brief trigger
 *   "Social Mentions"  — Twitter/X and web mentions
 *   "Documents Log"    — central index of all Drive docs
 *   "ICP Signals"      — competitor ICP targeting signals
 *   "Knowledge Base"   — weekly insights from market analysis
 *   "Hypothesis Ledger"— A/B test hypotheses and results
 *   "Content Brief"    — live campaign/weekly brief blob
 */

import { google } from "googleapis";
import { logger } from "./logger.js";

const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_ID ?? "";

const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive",
];

/* ── Auth (mirrors drive.ts) ──────────────────────────────────── */
function parseServiceAccountJson(raw: string): object {
  let s = raw.trim();
  if (s.startsWith('"') && s.endsWith('"')) {
    try { s = JSON.parse(s) as string; } catch { /* keep */ }
  }
  s = s.replace(/\\n/g, "\n");
  return JSON.parse(s);
}

function getAuth() {
  const b64 = process.env.GOOGLE_SERVICE_ACCOUNT_B64;
  let creds: object | null = null;
  if (b64) {
    try { creds = JSON.parse(Buffer.from(b64, "base64").toString("utf8")); } catch { /* fall through */ }
  }
  if (!creds) {
    const inline = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    if (inline) {
      try { creds = parseServiceAccountJson(inline); } catch { /* fall through */ }
    }
  }
  if (!creds) throw new Error("sheets-client: no service account credentials found");
  return new google.auth.GoogleAuth({ credentials: creds, scopes: SCOPES });
}

function getSheetsClient() {
  return google.sheets({ version: "v4", auth: getAuth() });
}

/* ── Ensure a sheet tab exists, create it with a header row if not ─── */
async function ensureTab(tabName: string, headerRow: string[]): Promise<void> {
  if (!SPREADSHEET_ID) return;
  try {
    const s = getSheetsClient();
    const meta = await s.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
    const exists = (meta.data.sheets || []).some(
      (sh) => sh.properties?.title === tabName,
    );
    if (!exists) {
      await s.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: {
          requests: [{ addSheet: { properties: { title: tabName } } }],
        },
      });
      // Write header row
      await s.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `'${tabName}'!A1`,
        valueInputOption: "RAW",
        requestBody: { values: [headerRow] },
      });
      logger.info({ tab: tabName }, "sheets-client: tab created");
    }
  } catch (e) {
    logger.warn({ tab: tabName, err: String(e) }, "sheets-client: ensureTab failed (non-fatal)");
  }
}

/* ── Generic append ───────────────────────────────────────────── */
async function appendRows(tab: string, rows: (string | number | null)[][]): Promise<void> {
  if (!SPREADSHEET_ID) {
    logger.warn("sheets-client: GOOGLE_SHEETS_ID not set — skipping sheet write");
    return;
  }
  try {
    const s = getSheetsClient();
    await s.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `'${tab}'!A1`,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: rows },
    });
  } catch (e) {
    logger.warn({ tab, err: String(e) }, "sheets-client: append failed (non-fatal)");
  }
}

/* Find a row by ID in column A of a tab, return its row index (1-based) or -1 */
async function findRowById(tab: string, id: string): Promise<number> {
  if (!SPREADSHEET_ID) return -1;
  try {
    const s = getSheetsClient();
    const r = await s.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `'${tab}'!A:A`,
    });
    const vals = r.data.values ?? [];
    for (let i = 1; i < vals.length; i++) {
      if (vals[i]?.[0] === id) return i + 1; // 1-based sheet row
    }
    return -1;
  } catch {
    return -1;
  }
}

/* Update a specific row range */
async function updateRow(tab: string, rowIndex: number, values: (string | number | null)[]): Promise<void> {
  if (!SPREADSHEET_ID) return;
  try {
    const s = getSheetsClient();
    await s.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `'${tab}'!A${rowIndex}`,
      valueInputOption: "RAW",
      requestBody: { values: [values] },
    });
  } catch (e) {
    logger.warn({ tab, rowIndex, err: String(e) }, "sheets-client: update failed (non-fatal)");
  }
}

/* ── Public API ───────────────────────────────────────────────── */

import type { CompetitorPost, ContentEntry } from "./content-library.js";

/* ── Content Library (Qoyod owned posts) ─────────────────────── */

const CONTENT_LIB_TAB = "Content Library";
const CONTENT_LIB_HEADER = [
  "ID",          // A — unique key used for upsert
  "Date",        // B — published_at YYYY-MM-DD
  "Channel",     // C — Instagram / LinkedIn / Facebook / etc.
  "Type",        // D — post / reel / story / email / ad / blog
  "Funnel",      // E — TOF / MOF / BOF
  "Topic",       // F — product / concept
  "Tone",        // G — educational / promotional / etc.
  "Content",     // H — caption / body (500 char max)
  "Hashtags",    // I — #joined #by #space
  "Post URL",    // J — live link
  "Media",       // K — VIDEO / IMAGE / TEXT
  "Brand Voice", // L — 1–10
  "Hook",        // M — 1–10
  "Clarity",     // N — 1–10
  "Dialect OK",  // O — TRUE / FALSE
  "QA Notes",    // P — quality.notes
  "What Works",  // Q — optimization.what_works
  "To Improve",  // R — optimization.what_to_improve
  "Variant",     // S — optimization.suggested_variant
  "Analyzed At", // T — ISO timestamp
];

function contentEntryToRow(e: ContentEntry): (string | number | null)[] {
  return [
    e.id,
    e.published_at.slice(0, 10),
    e.channel,
    e.type,
    e.funnel ?? null,
    e.topic ?? null,
    e.tone ?? null,
    (e.content_text || "").slice(0, 500),
    e.hashtags?.length ? e.hashtags.map(h => `#${h}`).join(" ") : null,
    e.post_url ?? null,
    e.media_type ?? null,
    e.quality?.brand_voice ?? null,
    e.quality?.hook_strength ?? null,
    e.quality?.clarity ?? null,
    e.quality?.dialect_correct != null ? String(e.quality.dialect_correct).toUpperCase() : null,
    e.quality?.notes ?? null,
    e.optimization?.what_works ?? null,
    e.optimization?.what_to_improve ?? null,
    e.optimization?.suggested_variant ?? null,
    e.analyzed_at ?? null,
  ];
}

/**
 * Upsert a Qoyod content entry into the "Content Library" tab.
 * Matches on ID (col A) — updates existing row, appends if new.
 */
export async function sheetsUpsertContentEntry(entry: ContentEntry): Promise<void> {
  if (!SPREADSHEET_ID) return;
  try {
    await ensureTab(CONTENT_LIB_TAB, CONTENT_LIB_HEADER);
    const row = contentEntryToRow(entry);
    const existingRowIdx = await findRowById(CONTENT_LIB_TAB, entry.id);
    if (existingRowIdx > 0) {
      await updateRow(CONTENT_LIB_TAB, existingRowIdx, row);
      logger.info({ id: entry.id }, "sheets-client: content entry updated");
    } else {
      await appendRows(CONTENT_LIB_TAB, [row]);
      logger.info({ id: entry.id }, "sheets-client: content entry appended");
    }
  } catch (e) {
    logger.warn({ id: entry.id, err: String(e) }, "sheets-client: content entry upsert failed (non-fatal)");
  }
}

/* ── Competitor Posts ─────────────────────────────────────────── */

const COMPETITOR_POSTS_HEADER = [
  "Competitor", "Channel", "Content", "Post URL", "Fetched At", "Engagement",
];

function competitorPostToRow(p: CompetitorPost): (string | number | null)[] {
  return [
    p.competitor,
    p.channel === "Twitter" ? "Twitter/X" : p.channel,
    p.content_text,
    p.post_url ?? null,
    p.fetched_at,
    p.engagement_hint ?? null,
  ];
}

/** Append competitor posts to the "Competitor Posts" tab (skip duplicates by URL). */
export async function sheetsAppendCompetitorPosts(posts: CompetitorPost[]): Promise<void> {
  if (posts.length === 0) return;
  if (!SPREADSHEET_ID) {
    logger.warn("sheets-client: GOOGLE_SHEETS_ID not set — skipping competitor sheet write");
    return;
  }
  try {
    await ensureTab("Competitor Posts", COMPETITOR_POSTS_HEADER);
    const s = getSheetsClient();
    const r = await s.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: "'Competitor Posts'!D:D",
    });
    const existingUrls = new Set((r.data.values ?? []).flat().filter(Boolean));
    const newPosts = posts.filter((p) => !p.post_url || !existingUrls.has(p.post_url));
    if (newPosts.length === 0) {
      logger.info("sheets-client: all competitor posts already in sheet");
      return;
    }
    await appendRows("Competitor Posts", newPosts.map(competitorPostToRow));
    logger.info({ count: newPosts.length }, "sheets-client: appended competitor posts");
  } catch (e) {
    logger.warn({ err: String(e) }, "sheets-client: competitor append failed (non-fatal)");
  }
}

/** Read recent WIN-tagged hypotheses from "Hypothesis Ledger" tab.
 *  Used by D1 (Pattern Library auto-feed) — top N most recent winners
 *  get injected as few-shot examples in content generation prompts.
 *  Schema columns: id | shipped_at | hypothesis | expected_lift |
 *                  actual_result | verdict | lesson | atomic_id |
 *                  sector | channel | funnel_stage
 */
export async function sheetsReadWinners(limit = 5): Promise<Array<{
  id: string;
  hypothesis: string;
  actual_result?: string;
  lesson?: string;
  sector?: string;
  channel?: string;
  funnel_stage?: string;
  shipped_at?: string;
}>> {
  if (!SPREADSHEET_ID) return [];
  try {
    const s = getSheetsClient();
    const r = await s.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: "'Hypothesis Ledger'!A2:K", // skip header row
    });
    const rows = r.data.values ?? [];
    const wins = rows
      .filter((row) => (row[5] || "").toUpperCase() === "WIN")
      // Sort by shipped_at descending
      .sort((a, b) => (b[1] || "").localeCompare(a[1] || ""))
      .slice(0, limit)
      .map((row) => ({
        id: row[0] || "",
        shipped_at: row[1],
        hypothesis: row[2] || "",
        actual_result: row[4],
        lesson: row[6],
        sector: row[8],
        channel: row[9],
        funnel_stage: row[10],
      }));
    return wins;
  } catch (e) {
    logger.warn({ err: String(e) }, "sheets-client: read winners failed");
    return [];
  }
}

/** Append a hypothesis/result to the "Hypothesis Ledger" tab.
 *  Schema follows the master prompt section 3.1: id, hypothesis, expected_lift,
 *  actual_result, verdict, lesson, atomic_id, sector, channel, funnel_stage. */
export async function sheetsAppendHypothesis(h: {
  id: string;
  shipped_at: string;
  hypothesis: string;
  expected_lift?: string;
  actual_result?: string;
  verdict?: "WIN" | "LOSS" | "INCONCLUSIVE" | "PENDING";
  lesson?: string;
  atomic_id?: string;
  sector?: string;
  channel?: string;
  funnel_stage?: string;
}): Promise<void> {
  await appendRows("Hypothesis Ledger", [[
    h.id,
    h.shipped_at,
    h.hypothesis,
    h.expected_lift ?? null,
    h.actual_result ?? null,
    h.verdict ?? "PENDING",
    h.lesson ?? null,
    h.atomic_id ?? null,
    h.sector ?? null,
    h.channel ?? null,
    h.funnel_stage ?? null,
  ]]);
}

/** Append a content brief to the "Content Briefs" tab.
 *  source: "sheets" | "typeform" | "ui" | "manual"
 */
export async function sheetsAppendBrief(brief: {
  source: string;
  brief_id: string;
  created_at: string;
  submitted_by?: string;
  campaign_name?: string;
  target_channel?: string;
  tone?: string;
  topic?: string;
  keywords?: string;
  notes?: string;
  status?: string;
  generated_content?: string;
}): Promise<void> {
  await appendRows("Content Briefs", [[
    brief.source,
    brief.brief_id,
    brief.created_at,
    brief.submitted_by ?? null,
    brief.campaign_name ?? null,
    brief.target_channel ?? null,
    brief.tone ?? null,
    brief.topic ?? null,
    brief.keywords ?? null,
    brief.notes ?? null,
    brief.status ?? "pending",
    brief.generated_content ?? null,
  ]]);
}

/** Append knowledge base entries to the "Knowledge Base" tab.
 *  Schema: week | type | sector | channel | insight | source | confidence | added_at
 */
const KB_HEADER = ["week", "type", "sector", "channel", "insight", "source", "confidence", "added_at"];

export async function sheetsAppendKnowledge(entries: Array<{
  week: string;
  type: string;
  sector: string;
  channel: string;
  insight: string;
  source: string;
  confidence: string;
  added_at: string;
}>): Promise<void> {
  if (entries.length === 0) return;
  await ensureTab("Knowledge Base", KB_HEADER);
  await appendRows("Knowledge Base", entries.map((e) => [
    e.week,
    e.type,
    e.sector,
    e.channel,
    e.insight,
    e.source,
    e.confidence,
    e.added_at,
  ]));
}

/** Read recent knowledge base entries (all types), newest first.
 *  Returns last `limit` rows from the "Knowledge Base" tab.
 */
export async function sheetsReadKnowledge(limit = 40): Promise<Array<{
  week: string;
  type: string;
  sector: string;
  channel: string;
  insight: string;
  source: string;
  confidence: string;
  added_at: string;
}>> {
  if (!SPREADSHEET_ID) return [];
  try {
    const s = getSheetsClient();
    const r = await s.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: "'Knowledge Base'!A2:H", // skip header row
    });
    const rows = r.data.values ?? [];
    return rows
      .filter((row) => row[0] && row[4]) // must have week + insight
      .sort((a, b) => (b[7] || "").localeCompare(a[7] || "")) // newest first by added_at
      .slice(0, limit)
      .map((row) => ({
        week: row[0] || "",
        type: row[1] || "content_insight",
        sector: row[2] || "All",
        channel: row[3] || "All",
        insight: row[4] || "",
        source: row[5] || "market",
        confidence: row[6] || "medium",
        added_at: row[7] || "",
      }));
  } catch (e) {
    logger.warn({ err: String(e) }, "sheets-client: read knowledge failed");
    return [];
  }
}

/* ── ICP Signals ──────────────────────────────────────────────── */
const ICP_SIGNAL_HEADER = ["Date", "ICP_ID", "ICP_Title", "Competitor", "Pain_Hook", "Channel", "Post_Snippet"];

export interface ICPSignal {
  date: string;
  icp_id: string;
  icp_title: string;
  competitor: string;
  pain_hook: string;
  channel: string;
  post_snippet: string;
}

/** Append a competitor ICP targeting signal to the "ICP Signals" tab. */
export async function sheetsLogICPSignal(signal: ICPSignal): Promise<void> {
  await ensureTab("ICP Signals", ICP_SIGNAL_HEADER);
  await appendRows("ICP Signals", [[
    signal.date,
    signal.icp_id,
    signal.icp_title,
    signal.competitor,
    signal.pain_hook,
    signal.channel,
    signal.post_snippet,
  ]]);
}

/** Read ICP signals from the last N days. */
export async function sheetsGetICPSignals(daysBack = 30): Promise<ICPSignal[]> {
  if (!SPREADSHEET_ID) return [];
  try {
    const s = getSheetsClient();
    const r = await s.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: "'ICP Signals'!A2:G",
    });
    const rows = r.data.values ?? [];
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - daysBack);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    return rows
      .filter(row => row[0] >= cutoffStr && row[1])
      .map(row => ({
        date:         row[0] || "",
        icp_id:       row[1] || "",
        icp_title:    row[2] || "",
        competitor:   row[3] || "",
        pain_hook:    row[4] || "",
        channel:      row[5] || "",
        post_snippet: row[6] || "",
      }));
  } catch (e) {
    logger.warn({ err: String(e) }, "sheets-client: read ICP signals failed");
    return [];
  }
}

/** Log a Drive document to the "Documents Log" tab — central link index. */
export async function sheetsLogDocument(entry: {
  date: string;
  type: string;
  title: string;
  link: string;
  source?: string;
}): Promise<void> {
  await ensureTab("Documents Log", ["Date", "Type", "Title", "Link", "Source"]);
  await appendRows("Documents Log", [[
    entry.date,
    entry.type,
    entry.title,
    entry.link,
    entry.source ?? "server",
  ]]);
}

/** Read the most recent N rows from "Documents Log", optionally filtered by type. */
export async function sheetsReadDocumentsLog(limit = 20, filterType?: string): Promise<Array<{
  date: string; type: string; title: string; link: string; source: string;
}>> {
  if (!SPREADSHEET_ID) return [];
  try {
    const s = getSheetsClient();
    const res = await s.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: "'Documents Log'!A2:E",
    });
    const rows = (res.data.values || []) as string[][];
    const mapped = rows
      .map(r => ({ date: r[0] ?? "", type: r[1] ?? "", title: r[2] ?? "", link: r[3] ?? "", source: r[4] ?? "" }))
      .filter(r => r.link)
      .filter(r => !filterType || r.type === filterType);
    return mapped.slice(-limit).reverse(); // newest first
  } catch (e) {
    logger.warn({ err: String(e) }, "sheets-client: readDocumentsLog failed (non-fatal)");
    return [];
  }
}

/** Clear the Social Mentions tab and rewrite just the header row. */
export async function sheetsResetContentBriefs(): Promise<void> {
  if (!SPREADSHEET_ID) return;
  const s = getSheetsClient();
  const header = ["Source","Brief ID","Created At","Submitted By","Campaign Name","Target Channel","Tone","Topic","Keywords","Notes","Status","Generated Content"];
  await s.spreadsheets.values.clear({ spreadsheetId: SPREADSHEET_ID, range: "'Content Briefs'" }).catch(() => {});
  await ensureTab("Content Briefs", header);
  await s.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: "'Content Briefs'!A1",
    valueInputOption: "RAW",
    requestBody: { values: [header] },
  });
}

export async function sheetsResetSocialMentions(): Promise<void> {
  if (!SPREADSHEET_ID) return;
  const s = getSheetsClient();
  const header = ["Run At", "Group", "Platform", "Keyword", "Author", "Posted At", "Text", "URL"];
  // Clear everything then write the header
  await s.spreadsheets.values.clear({
    spreadsheetId: SPREADSHEET_ID,
    range: "'Social Mentions'",
  }).catch(() => {}); // tab may not exist yet
  await ensureTab("Social Mentions", header);
  await s.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: "'Social Mentions'!A1",
    valueInputOption: "RAW",
    requestBody: { values: [header] },
  });
}

/** Append Twitter/X and web mentions to the "Social Mentions" tab. */
export async function sheetsAppendMentions(runAt: string, mentions: Array<{
  keyword: string;
  group: string;
  platform: string;
  text: string;
  url: string;
  author?: string;
  postedAt?: string;
}>): Promise<void> {
  if (mentions.length === 0) return;
  await ensureTab("Social Mentions", ["Run At", "Group", "Platform", "Keyword", "Author", "Posted At", "Text", "URL"]);
  await appendRows("Social Mentions", mentions.map(m => [
    runAt,
    m.group,
    m.platform,
    m.keyword,
    m.author ?? null,
    m.postedAt ?? null,
    m.text.slice(0, 500),
    m.url ?? null,
  ]));
  logger.info({ count: mentions.length }, "sheets-client: social mentions written to sheet");
}

// ── Campaign State — persists active campaign brief JSON across Railway redeploys ─
const BRIEF_TAB = "Campaign State";

/** Read the raw JSON blob from the Campaign State tab. Returns null if empty. */
export async function sheetsGetBriefJson(): Promise<string | null> {
  if (!SPREADSHEET_ID) return null;
  try {
    await ensureTab(BRIEF_TAB, ["key", "value"]);
    const s = getSheetsClient();
    const res = await s.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `'${BRIEF_TAB}'!A2:B2`,
    });
    return (res.data.values?.[0]?.[1] as string) ?? null;
  } catch (e) {
    logger.warn({ err: String(e) }, "sheets-client: getBriefJson failed (non-fatal)");
    return null;
  }
}

/** Write the raw JSON blob to the Campaign State tab. */
export async function sheetsSetBriefJson(json: string): Promise<void> {
  if (!SPREADSHEET_ID) return;
  try {
    await ensureTab(BRIEF_TAB, ["key", "value"]);
    const s = getSheetsClient();
    await s.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `'${BRIEF_TAB}'!A2:B2`,
      valueInputOption: "RAW",
      requestBody: { values: [["brief", json]] },
    });
    logger.info("sheets-client: campaign state saved");
  } catch (e) {
    logger.warn({ err: String(e) }, "sheets-client: setBriefJson failed (non-fatal)");
  }
}

/* ── Activity feed ────────────────────────────────────────────── */
const ACTIVITY_HEADER = ["Timestamp", "Source", "Summary", "Items", "Status"];

/** Prepend one activity entry to the "Activity" tab so newest rows appear first. Non-blocking. */
export async function sheetsLogActivity(
  source: string,
  summary: string,
  items = 0,
  status: "ok" | "warn" = "ok"
): Promise<void> {
  if (!SPREADSHEET_ID) return;
  try {
    await ensureTab("Activity", ACTIVITY_HEADER);
    const s = getSheetsClient();
    const meta = await s.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID, fields: "sheets.properties" });
    const sheetId = (meta.data.sheets ?? []).find(sh => sh.properties?.title === "Activity")?.properties?.sheetId;
    if (sheetId == null) return;
    await s.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: { requests: [{ insertDimension: { range: { sheetId, dimension: "ROWS", startIndex: 1, endIndex: 2 }, inheritFromBefore: false } }] },
    });
    await s.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: "'Activity'!A2:E2",
      valueInputOption: "RAW",
      requestBody: { values: [[new Date().toISOString(), source, summary, items, status]] },
    });
  } catch (e) {
    logger.warn({ source, err: String(e) }, "sheets-client: activity log failed (non-fatal)");
  }
}

/** Read the most recent N activity entries from the Activity tab. */
export async function sheetsReadActivity(limit = 50): Promise<Array<{
  timestamp: string; source: string; summary: string; items: number; status: string;
}>> {
  if (!SPREADSHEET_ID) return [];
  try {
    const s = getSheetsClient();
    const r = await s.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `'Activity'!A2:E${limit + 1}`,
    });
    return (r.data.values ?? []).map(row => ({
      timestamp: String(row[0] ?? ""),
      source: String(row[1] ?? ""),
      summary: String(row[2] ?? ""),
      items: Number(row[3] ?? 0),
      status: String(row[4] ?? "ok"),
    }));
  } catch { return []; }
}

/* ── Formatting helpers ───────────────────────────────────────── */

type RgbColor = { red: number; green: number; blue: number };
function hex(h: string): RgbColor {
  const n = parseInt(h.replace("#",""), 16);
  return { red: ((n>>16)&255)/255, green: ((n>>8)&255)/255, blue: (n&255)/255 };
}
function dropdown(sheetId: number, startCol: number, endCol: number, values: string[]) {
  return {
    setDataValidation: {
      range: { sheetId, startRowIndex: 1, endRowIndex: 2000, startColumnIndex: startCol, endColumnIndex: endCol },
      rule: {
        condition: { type: "ONE_OF_LIST", values: values.map(v => ({ userEnteredValue: v })) },
        showCustomUi: true, strict: false,
      },
    },
  };
}
function condFmt(sheetId: number, colIdx: number, text: string, bgHex: string, textHex = "#FFFFFF") {
  return {
    addConditionalFormatRule: {
      rule: {
        ranges: [{ sheetId, startRowIndex: 1, endRowIndex: 2000, startColumnIndex: colIdx, endColumnIndex: colIdx + 1 }],
        booleanRule: {
          condition: { type: "TEXT_EQ", values: [{ userEnteredValue: text }] },
          format: { backgroundColor: hex(bgHex), textFormat: { bold: true, foregroundColor: hex(textHex) } },
        },
      },
      index: 0,
    },
  };
}
function colWidth(sheetId: number, col: number, px: number) {
  return {
    updateDimensionProperties: {
      range: { sheetId, dimension: "COLUMNS", startIndex: col, endIndex: col + 1 },
      properties: { pixelSize: px },
      fields: "pixelSize",
    },
  };
}
function headerFormat(sheetId: number, colCount: number) {
  return {
    repeatCell: {
      range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: colCount },
      cell: {
        userEnteredFormat: {
          backgroundColor: hex("#021544"),
          textFormat: { bold: true, foregroundColor: hex("#FFFFFF"), fontSize: 10 },
          verticalAlignment: "MIDDLE",
          wrapStrategy: "CLIP",
        },
      },
      fields: "userEnteredFormat(backgroundColor,textFormat,verticalAlignment,wrapStrategy)",
    },
  };
}
function freezePane(sheetId: number, rows = 1, cols = 0) {
  return {
    updateSheetProperties: {
      properties: { sheetId, gridProperties: { frozenRowCount: rows, frozenColumnCount: cols } },
      fields: "gridProperties.frozenRowCount,gridProperties.frozenColumnCount",
    },
  };
}
function altRows(sheetId: number, colCount: number) {
  return {
    addConditionalFormatRule: {
      rule: {
        ranges: [{ sheetId, startRowIndex: 1, endRowIndex: 2000, startColumnIndex: 0, endColumnIndex: colCount }],
        booleanRule: {
          condition: { type: "CUSTOM_FORMULA", values: [{ userEnteredValue: "=MOD(ROW(),2)=0" }] },
          format: { backgroundColor: hex("#F4F8FB") },
        },
      },
      index: 0,
    },
  };
}

/**
 * Apply full visual formatting to all known content tabs:
 * Content Library, Competitor Posts, Knowledge Base, Hypothesis Ledger, ICP Signals, Documents Log.
 * Safe to call multiple times — conditional format rules are additive but idempotent in effect.
 */
export async function sheetsApplyLibraryFormatting(): Promise<{ formatted: string[]; skipped: string[] }> {
  if (!SPREADSHEET_ID) return { formatted: [], skipped: ["no SPREADSHEET_ID"] };
  const s = getSheetsClient();

  // Get all sheet IDs + existing conditional format rules so we can clear before re-applying
  const meta = await s.spreadsheets.get({
    spreadsheetId: SPREADSHEET_ID,
    fields: "sheets.properties,sheets.conditionalFormats",
  });
  const idMap: Record<string, number> = {};
  // sheetId → count of existing condFmt rules (need to delete all before re-adding)
  const condFmtCounts: Record<number, number> = {};
  for (const sh of meta.data.sheets ?? []) {
    if (sh.properties?.title && sh.properties.sheetId != null) {
      idMap[sh.properties.title] = sh.properties.sheetId;
      const sid = sh.properties.sheetId;
      const count = (sh as any).conditionalFormats?.length ?? 0;
      if (count > 0) condFmtCounts[sid] = count;
    }
  }

  // ── One-time migrations (idempotent) ─────────────────────────────────────
  // 0. Delete deprecated tabs: Documents Log, Campaign State, Content Library
  const DEPRECATED_TABS = ["Documents Log", "Campaign State", "Content Library"];
  const deleteTabRequests = DEPRECATED_TABS
    .filter(t => idMap[t] != null)
    .map(t => ({ deleteSheet: { sheetId: idMap[t] } }));
  if (deleteTabRequests.length > 0) {
    await s.spreadsheets.batchUpdate({ spreadsheetId: SPREADSHEET_ID, requestBody: { requests: deleteTabRequests } });
    DEPRECATED_TABS.forEach(t => delete idMap[t]);
    logger.info({ deleted: DEPRECATED_TABS.filter(t => deleteTabRequests.length) }, "sheets-client: deprecated tabs removed");
  }

  // 1. Rename "Content Brief" → "Campaign State"
  if (idMap["Content Brief"] != null && idMap["Campaign State"] == null) {
    await s.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: { requests: [{ updateSheetProperties: {
        properties: { sheetId: idMap["Content Brief"], title: "Campaign State" },
        fields: "title",
      }}]},
    });
    idMap["Campaign State"] = idMap["Content Brief"];
    delete idMap["Content Brief"];
  }

  // 2. Fix Competitor Posts header to 6-col schema (was written with old 9-col names)
  if (idMap["Competitor Posts"] != null) {
    await s.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: "'Competitor Posts'!A1:F1",
      valueInputOption: "RAW",
      requestBody: { values: [["Competitor", "Channel", "Content", "Post URL", "Fetched At", "Engagement"]] },
    });
    // Normalize legacy "Twitter" values to "Twitter/X" in the Channel column
    await s.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        requests: [{
          findReplace: {
            find: "Twitter",
            replacement: "Twitter/X",
            matchEntireCell: true,
            range: {
              sheetId: idMap["Competitor Posts"],
              startRowIndex: 1,
              startColumnIndex: 1,
              endColumnIndex: 2,
            },
          },
        }],
      },
    });
  }

  // 3. Update Content Briefs header row to 12-col schema (adds Source as first col)
  if (idMap["Content Briefs"] != null) {
    await s.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: "'Content Briefs'!A1:L1",
      valueInputOption: "RAW",
      requestBody: { values: [["Source","Brief ID","Created At","Submitted By","Campaign Name","Target Channel","Tone","Topic","Keywords","Notes","Status","Generated Content"]] },
    });
  }

  // Delete all existing conditional format rules (accumulated from prior calls) before re-adding.
  // Must delete from the highest index down, otherwise indices shift after each deletion.
  const deleteRequests: object[] = [];
  for (const [sidStr, count] of Object.entries(condFmtCounts)) {
    const sid = Number(sidStr);
    for (let i = count - 1; i >= 0; i--) {
      deleteRequests.push({ deleteConditionalFormatRule: { sheetId: sid, index: i } });
    }
  }
  if (deleteRequests.length > 0) {
    await s.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: { requests: deleteRequests },
    });
  }

  const requests: object[] = [];
  const formatted: string[] = [];

  /* ── Content Library (20 cols) ─────────────────────────────── */
  if (idMap["Content Library"] != null) {
    const id = idMap["Content Library"];
    //          ID  Date  Chan  Type  Funnel Topic Tone  Content Hashtags URL  Media BV  Hook Clar DialOK QANotes WW   TI   Var  Ana
    const w = [110,  90,  105,  80,   70,   155,  105,  320,    160,     210,  80,  65,  65,  65,  80,   210,  210, 210, 210, 140];
    requests.push(
      freezePane(id, 1, 1),
      headerFormat(id, 20),
      altRows(id, 20),
      ...w.map((px, i) => colWidth(id, i, px)),
      dropdown(id, 2, 3, ["Instagram","Facebook","LinkedIn","Twitter/X","TikTok","YouTube","Snapchat","Email","WhatsApp"]),
      dropdown(id, 3, 4, ["post","reel","story","email","ad","blog","other"]),
      dropdown(id, 4, 5, ["TOF","MOF","BOF"]),
      dropdown(id, 6, 7, ["educational","promotional","community","humour","urgency","awareness"]),
      dropdown(id, 10, 11, ["VIDEO","IMAGE","TEXT","CAROUSEL"]),
      condFmt(id, 4, "TOF", "#F5A623", "#FFFFFF"),
      condFmt(id, 4, "MOF", "#0E8585", "#FFFFFF"),
      condFmt(id, 4, "BOF", "#2E7D32", "#FFFFFF"),
      condFmt(id, 2, "Instagram", "#E1306C", "#FFFFFF"),
      condFmt(id, 2, "LinkedIn",  "#0A66C2", "#FFFFFF"),
      condFmt(id, 2, "TikTok",    "#010101", "#FFFFFF"),
      condFmt(id, 2, "YouTube",   "#FF0000", "#FFFFFF"),
      condFmt(id, 2, "Facebook",  "#1877F2", "#FFFFFF"),
    );
    formatted.push("Content Library");
  }

  /* ── Competitor Posts (6 cols: competitor,channel,content,post_url,fetched_at,engagement) */
  if (idMap["Competitor Posts"] != null) {
    const id = idMap["Competitor Posts"];
    const w = [140, 120, 400, 240, 145, 160];
    requests.push(
      freezePane(id, 1, 0),
      headerFormat(id, 6),
      altRows(id, 6),
      ...w.map((px, i) => colWidth(id, i, px)),
      // Clear the stale data validation that was on col 2 (Content) before the column fix
      { setDataValidation: { range: { sheetId: id, startRowIndex: 1, endRowIndex: 2000, startColumnIndex: 2, endColumnIndex: 3 } } },
      dropdown(id, 1, 2, ["Instagram","Facebook","LinkedIn","Twitter/X","TikTok","YouTube","Snapchat"]),
      condFmt(id, 1, "Instagram",  "#E1306C", "#FFFFFF"),
      condFmt(id, 1, "Facebook",   "#1877F2", "#FFFFFF"),
      condFmt(id, 1, "YouTube",    "#FF0000", "#FFFFFF"),
      condFmt(id, 1, "TikTok",     "#010101", "#FFFFFF"),
      condFmt(id, 1, "LinkedIn",   "#0A66C2", "#FFFFFF"),
      condFmt(id, 1, "Twitter/X",  "#1DA1F2", "#FFFFFF"),
      condFmt(id, 1, "Snapchat",   "#FFFC00", "#000000"),
    );
    formatted.push("Competitor Posts");
  }

  /* ── Qoyod Posts (10 cols: post_id,type,platform,posted_at,caption,url,topic,content_type,score,scraped_at) */
  if (idMap["Qoyod Posts"] != null) {
    const id = idMap["Qoyod Posts"];
    const w = [100, 75, 110, 145, 340, 220, 200, 110, 70, 145];
    requests.push(
      freezePane(id, 1, 0),
      headerFormat(id, 10),
      altRows(id, 10),
      ...w.map((px, i) => colWidth(id, i, px)),
      dropdown(id, 2, 3, ["Instagram","Facebook","LinkedIn","Twitter/X","TikTok","YouTube","Snapchat"]),
      dropdown(id, 7, 8, ["educational","promotional","community","humour","urgency","awareness"]),
      condFmt(id, 2, "Instagram", "#E1306C", "#FFFFFF"),
      condFmt(id, 2, "Facebook",  "#1877F2", "#FFFFFF"),
      condFmt(id, 2, "YouTube",   "#FF0000", "#FFFFFF"),
      condFmt(id, 2, "TikTok",    "#010101", "#FFFFFF"),
    );
    formatted.push("Qoyod Posts");
  }

  /* ── Content Briefs (12 cols: source,brief_id,created_at,submitted_by,campaign_name,target_channel,tone,topic,keywords,notes,status,generated_content) */
  if (idMap["Content Briefs"] != null) {
    const id = idMap["Content Briefs"];
    const w = [100, 130, 145, 140, 180, 130, 100, 200, 180, 200, 100, 300];
    requests.push(
      freezePane(id, 1, 0),
      headerFormat(id, 12),
      altRows(id, 12),
      ...w.map((px, i) => colWidth(id, i, px)),
      dropdown(id, 0, 1, ["sheets","typeform","ui","manual"]),
      dropdown(id, 5, 6, ["Instagram","Facebook","LinkedIn","Twitter/X","TikTok","YouTube","Snapchat","Email","WhatsApp"]),
      dropdown(id, 10, 11, ["pending","approved","published","archived"]),
      condFmt(id, 0, "sheets",   "#1565C0", "#FFFFFF"),
      condFmt(id, 0, "typeform", "#6A1B9A", "#FFFFFF"),
      condFmt(id, 0, "ui",       "#2E7D32", "#FFFFFF"),
      condFmt(id, 10, "approved",  "#2E7D32", "#FFFFFF"),
      condFmt(id, 10, "published", "#1565C0", "#FFFFFF"),
      condFmt(id, 10, "archived",  "#616161", "#FFFFFF"),
    );
    formatted.push("Content Briefs");
  }

  /* ── Knowledge Base (8 cols) ───────────────────────────────── */
  if (idMap["Knowledge Base"] != null) {
    const id = idMap["Knowledge Base"];
    const w = [90, 110, 110, 110, 380, 120, 95, 150];
    requests.push(
      freezePane(id, 1, 0),
      headerFormat(id, 8),
      altRows(id, 8),
      ...w.map((px, i) => colWidth(id, i, px)),
      dropdown(id, 1, 2, ["icp_signal","ad_pattern","hook_angle","content_insight","sector_insight","anti_pattern","competitor_move","competitor_insight"]),
      dropdown(id, 6, 7, ["high","medium","low"]),
    );
    formatted.push("Knowledge Base");
  }

  /* ── Hypothesis Ledger (11 cols) ───────────────────────────── */
  if (idMap["Hypothesis Ledger"] != null) {
    const id = idMap["Hypothesis Ledger"];
    const w = [90, 110, 300, 140, 200, 85, 250, 110, 110, 110, 90];
    requests.push(
      freezePane(id, 1, 0),
      headerFormat(id, 11),
      altRows(id, 11),
      ...w.map((px, i) => colWidth(id, i, px)),
      dropdown(id, 5, 6, ["WIN","LOSS","INCONCLUSIVE","PENDING"]),
      condFmt(id, 5, "WIN",  "#2E7D32", "#FFFFFF"),
      condFmt(id, 5, "LOSS", "#C62828", "#FFFFFF"),
      condFmt(id, 5, "INCONCLUSIVE", "#F57C00", "#FFFFFF"),
    );
    formatted.push("Hypothesis Ledger");
  }

  /* ── ICP Signals (7 cols) ──────────────────────────────────── */
  if (idMap["ICP Signals"] != null) {
    const id = idMap["ICP Signals"];
    const w = [100, 90, 160, 130, 280, 110, 280];
    requests.push(
      freezePane(id, 1, 0),
      headerFormat(id, 7),
      altRows(id, 7),
      ...w.map((px, i) => colWidth(id, i, px)),
    );
    formatted.push("ICP Signals");
  }

  /* ── Documents Log (5 cols) ────────────────────────────────── */
  if (idMap["Documents Log"] != null) {
    const id = idMap["Documents Log"];
    const w = [100, 140, 300, 250, 100];
    requests.push(
      freezePane(id, 1, 0),
      headerFormat(id, 5),
      altRows(id, 5),
      ...w.map((px, i) => colWidth(id, i, px)),
    );
    formatted.push("Documents Log");
  }

  /* ── Social Mentions (8 cols: run_at,group,platform,keyword,author,posted_at,text,url) */
  if (idMap["Social Mentions"] != null) {
    const id = idMap["Social Mentions"];
    const w = [145, 90, 115, 160, 120, 145, 400, 260];
    requests.push(
      freezePane(id, 1, 1),
      headerFormat(id, 8),
      altRows(id, 8),
      ...w.map((px, i) => colWidth(id, i, px)),
      dropdown(id, 1, 2, ["brand","zatca","market"]),
      dropdown(id, 2, 3, ["Twitter/X","LinkedIn","TikTok","Threads","Instagram","YouTube","Web"]),
      // Group colors
      condFmt(id, 1, "brand",    "#1565C0", "#FFFFFF"),
      condFmt(id, 1, "zatca",    "#E65100", "#FFFFFF"),
      condFmt(id, 1, "market",   "#2E7D32", "#FFFFFF"),
      // Platform colors — same palette as Content Library
      condFmt(id, 2, "LinkedIn",  "#0A66C2", "#FFFFFF"),
      condFmt(id, 2, "TikTok",    "#010101", "#FFFFFF"),
      condFmt(id, 2, "Instagram", "#E1306C", "#FFFFFF"),
      condFmt(id, 2, "YouTube",   "#FF0000", "#FFFFFF"),
      condFmt(id, 2, "Twitter/X", "#1DA1F2", "#FFFFFF"),
      condFmt(id, 2, "Threads",   "#000000", "#FFFFFF"),
      condFmt(id, 2, "Web",       "#546E7A", "#FFFFFF"),
    );
    formatted.push("Social Mentions");
  }

  /* ── Activity (5 cols: timestamp, source, summary, items, status) */
  if (idMap["Activity"] != null) {
    const id = idMap["Activity"];
    const w = [175, 170, 500, 70, 70];
    requests.push(
      freezePane(id, 1, 0),
      headerFormat(id, 5),
      altRows(id, 5),
      ...w.map((px, i) => colWidth(id, i, px)),
      condFmt(id, 1, "social_listener",    "#1565C0", "#FFFFFF"),
      condFmt(id, 1, "competitor_monitor", "#E65100", "#FFFFFF"),
      condFmt(id, 1, "competitor_poller",  "#BF360C", "#FFFFFF"),
      condFmt(id, 1, "hypothesis",         "#00695C", "#FFFFFF"),
      condFmt(id, 1, "knowledge_base",     "#6A1B9A", "#FFFFFF"),
      condFmt(id, 1, "content_gen",        "#2E7D32", "#FFFFFF"),
      condFmt(id, 1, "content_brief",      "#283593", "#FFFFFF"),
      condFmt(id, 4, "ok",                 "#2E7D32", "#FFFFFF"),
      condFmt(id, 4, "warn",               "#F57C00", "#FFFFFF"),
    );
    formatted.push("Activity");
  }

  if (requests.length === 0) return { formatted: [], skipped: Object.keys(idMap) };

  await s.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: { requests },
  });

  const skipped = Object.keys(idMap).filter(t => !formatted.includes(t));
  logger.info({ formatted, skipped }, "sheets-client: formatting applied");
  return { formatted, skipped };
}

/**
 * Read the most recent listening run from the "Social Mentions" tab.
 * Returns a ListeningResult reconstructed from the latest runAt batch.
 * Used as fallback when the local JSON cache doesn't exist (e.g. after Railway redeploy).
 */
export async function sheetsReadLatestListening(): Promise<{
  runAt: string;
  mentions: Array<{ keyword: string; group: "brand" | "zatca" | "market"; platform: string; text: string; url: string; author?: string; postedAt?: string }>;
  summary: string;
} | null> {
  if (!SPREADSHEET_ID) return null;
  try {
    const s = getSheetsClient();
    const r = await s.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: "'Social Mentions'!A2:H",
    });
    const rows = (r.data.values ?? []) as string[][];
    if (rows.length === 0) return null;

    // Find the most recent runAt (col A)
    const latestRunAt = rows.reduce((best, row) => (row[0] > best ? row[0] : best), rows[0][0]);

    const mentions = rows
      .filter(row => row[0] === latestRunAt)
      .map(row => ({
        keyword:  row[3] ?? "",
        group:    (["brand","zatca","market"].includes(row[1]) ? row[1] : "brand") as "brand" | "zatca" | "market",
        platform: row[2] ?? "Web",
        text:     row[6] ?? "",
        url:      row[7] ?? "",
        author:   row[4] || undefined,
        postedAt: row[5] || undefined,
      }));

    return { runAt: latestRunAt, mentions, summary: "" };
  } catch {
    return null;
  }
}

/** Health check — returns true if the sheet is reachable. */
export async function sheetsHealthCheck(): Promise<{ ok: boolean; url?: string; error?: string }> {
  if (!SPREADSHEET_ID) return { ok: false, error: "GOOGLE_SHEETS_ID not configured" };
  try {
    const s = getSheetsClient();
    await s.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
    return {
      ok: true,
      url: `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit`,
    };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
