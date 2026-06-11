/**
 * Google Sheets client for persistent content library storage.
 *
 * Uses the same service account as the Drive integration.
 * Env vars required:
 *   GOOGLE_SERVICE_ACCOUNT_JSON  — inline JSON (or GOOGLE_SERVICE_ACCOUNT_B64)
 *   GOOGLE_SHEETS_ID             — spreadsheet ID
 *
 * Sheet tabs:
 *   "Competitor Posts" — scraped competitor posts
 *   "Content Briefs"   — briefs submitted via Zapier sheets_brief trigger
 *   "Social Mentions"  — Twitter/X and web mentions
 *   "Documents Log"    — central index of all Drive docs
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

import type { CompetitorPost } from "./content-library.js";

function competitorPostToRow(p: CompetitorPost): (string | number | null)[] {
  return [
    p.competitor,
    p.channel,
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
  // Read existing URLs to deduplicate
  try {
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

/** Append a content brief to the "Content Briefs" tab. */
export async function sheetsAppendBrief(brief: {
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
}

// ── Content Brief — persists the campaign/weekly brief across deploys ─────────
const BRIEF_TAB = "Content Brief";

/** Read the raw JSON blob from the Content Brief tab (A2:B2). Returns null if empty. */
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

/** Write the raw JSON blob to A2:B2 of the Content Brief tab. */
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
    logger.info("sheets-client: content brief saved");
  } catch (e) {
    logger.warn({ err: String(e) }, "sheets-client: setBriefJson failed (non-fatal)");
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
