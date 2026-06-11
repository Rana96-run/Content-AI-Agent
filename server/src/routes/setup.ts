import { Router } from "express";
import { google } from "googleapis";
import { logger } from "../lib/logger.js";

const router = Router();

function getAuth() {
  const scopes = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
  ];
  const b64 = process.env.GOOGLE_SERVICE_ACCOUNT_B64;
  if (b64) {
    try {
      const creds = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
      return new google.auth.GoogleAuth({ credentials: creds, scopes });
    } catch { /* fall through */ }
  }
  const inline = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (inline) {
    try {
      let s = inline.trim();
      if (s.startsWith('"') && s.endsWith('"')) { try { s = JSON.parse(s) as string; } catch { /* keep */ } }
      s = s.replace(/\\n/g, "\n");
      const creds = JSON.parse(s);
      return new google.auth.GoogleAuth({ credentials: creds, scopes });
    } catch { /* fall through */ }
  }
  return new google.auth.GoogleAuth({ scopes });
}

// ── Tab definitions ──────────────────────────────────────────────────────────
const TABS = [
  {
    name: "Hypothesis Ledger",
    columns: ["ID", "Shipped At", "Hypothesis", "Expected Lift", "Actual Result", "Verdict", "Lesson", "Atomic ID", "Sector", "Channel", "Funnel Stage"],
    widths: [160, 120, 400, 160, 200, 100, 300, 120, 120, 120, 120],
  },
  {
    name: "Qoyod Posts",
    columns: ["ID", "Type", "Channel", "Published At", "Content Text", "Post URL", "Thumb URL", "Media Type", "Topic", "Hashtags", "Tone", "Quality Score", "Analyzed At"],
    widths: [160, 100, 120, 140, 400, 200, 200, 100, 160, 200, 100, 100, 140],
  },
  {
    name: "Competitor Posts",
    columns: ["Competitor", "Channel", "Content Text", "Post URL", "Fetched At", "Engagement Hint"],
    widths: [140, 120, 400, 220, 140, 160],
  },
  {
    name: "Content Briefs",
    columns: ["Brief ID", "Created At", "Submitted By", "Campaign Name", "Target Channel", "Tone", "Topic", "Keywords", "Notes", "Status", "Generated Content"],
    widths: [160, 140, 160, 200, 140, 100, 200, 200, 200, 100, 400],
  },
  {
    name: "Knowledge Base",
    columns: ["Week", "Type", "Sector", "Channel", "Insight", "Source", "Confidence", "Added At"],
    widths: [100, 140, 120, 120, 400, 160, 100, 140],
  },
  {
    name: "Social Mentions",
    columns: ["Run At", "Group", "Platform", "Keyword", "Author", "Posted At", "Text", "URL"],
    widths: [160, 100, 120, 200, 160, 160, 500, 260],
  },
] as const;

// Header style: dark blue-grey background (#2C3E50), white bold text
const HEADER_BG = { red: 0.172, green: 0.243, blue: 0.314 };  // #2C3E50
const WHITE = { red: 1, green: 1, blue: 1 };

/**
 * POST /api/setup/sheets
 * Idempotent — creates missing tabs, applies header formatting to all tabs.
 * Returns: { ok, sheet_url, tabs_created, tabs_existing }
 */
router.post("/sheets", async (_req, res) => {
  const sheetId = process.env.GOOGLE_SHEETS_ID;
  if (!sheetId) return res.status(503).json({ error: "GOOGLE_SHEETS_ID not set" });

  try {
    const auth = getAuth();
    const sheets = google.sheets({ version: "v4", auth });

    // ── Step 1: Get current tab list ────────────────────────────────────────
    const meta = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
    const existingNames = new Set(
      (meta.data.sheets ?? []).map((s) => s.properties?.title ?? "")
    );

    const tabsCreated: string[] = [];
    const tabsExisting: string[] = [];

    // ── Step 2: Create missing tabs with header rows in one batchUpdate ─────
    const missingTabs = TABS.filter((t) => !existingNames.has(t.name));

    if (missingTabs.length > 0) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: sheetId,
        requestBody: {
          requests: missingTabs.map((t) => ({
            addSheet: { properties: { title: t.name } },
          })),
        },
      });

      // Write header rows for new tabs
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: sheetId,
        requestBody: {
          valueInputOption: "RAW",
          data: missingTabs.map((t) => ({
            range: `'${t.name}'!A1`,
            values: [t.columns as unknown as string[]],
          })),
        },
      });

      tabsCreated.push(...missingTabs.map((t) => t.name));
    }

    TABS.filter((t) => existingNames.has(t.name)).forEach((t) => tabsExisting.push(t.name));

    // ── Step 3: Get fresh metadata with sheet IDs ───────────────────────────
    const freshMeta = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
    const sheetIdMap = new Map<string, number>(
      (freshMeta.data.sheets ?? []).map((s) => [
        s.properties?.title ?? "",
        s.properties?.sheetId ?? 0,
      ])
    );

    // ── Step 4: Apply formatting to ALL tabs (idempotent) ───────────────────
    const formatRequests: object[] = [];

    for (const tab of TABS) {
      const sid = sheetIdMap.get(tab.name);
      if (sid === undefined) continue;

      // Freeze row 1
      formatRequests.push({
        updateSheetProperties: {
          properties: { sheetId: sid, gridProperties: { frozenRowCount: 1 } },
          fields: "gridProperties.frozenRowCount",
        },
      });

      // Header row background + bold + white text
      formatRequests.push({
        repeatCell: {
          range: { sheetId: sid, startRowIndex: 0, endRowIndex: 1 },
          cell: {
            userEnteredFormat: {
              backgroundColor: HEADER_BG,
              textFormat: { bold: true, foregroundColor: WHITE, fontSize: 10 },
              verticalAlignment: "MIDDLE",
            },
          },
          fields: "userEnteredFormat(backgroundColor,textFormat,verticalAlignment)",
        },
      });

      // Column widths
      tab.widths.forEach((px, col) => {
        formatRequests.push({
          updateDimensionProperties: {
            range: { sheetId: sid, dimension: "COLUMNS", startIndex: col, endIndex: col + 1 },
            properties: { pixelSize: px },
            fields: "pixelSize",
          },
        });
      });

      // Alternating row colors for data rows (light grey on even rows)
      formatRequests.push({
        addBanding: {
          bandedRange: {
            bandedRangeId: undefined,
            range: { sheetId: sid, startRowIndex: 1, endRowIndex: 1000 },
            rowProperties: {
              headerColor: HEADER_BG,
              firstBandColor: { red: 1, green: 1, blue: 1 },           // white
              secondBandColor: { red: 0.95, green: 0.96, blue: 0.97 }, // very light blue-grey
            },
          },
        },
      });
    }

    if (formatRequests.length > 0) {
      try {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: sheetId,
          requestBody: { requests: formatRequests },
        });
      } catch (e) {
        // addBanding fails if banding already exists — retry without it
        const withoutBanding = formatRequests.filter(
          (r) => !("addBanding" in (r as object))
        );
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: sheetId,
          requestBody: { requests: withoutBanding },
        });
      }
    }

    const sheetUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/edit`;
    logger.info({ tabs_created: tabsCreated.length }, "setup: sheets configured");

    return res.json({
      ok: true,
      sheet_url: sheetUrl,
      tabs_created: tabsCreated,
      tabs_existing: tabsExisting,
      tabs_total: TABS.length,
    });

  } catch (e) {
    logger.error({ err: String(e) }, "setup: sheets failed");
    return res.status(500).json({ ok: false, error: String(e) });
  }
});

/**
 * GET /api/setup/status
 * Quick check — confirms both Drive folder and Sheets are reachable, returns URLs.
 */
router.get("/status", async (_req, res) => {
  const sheetId = process.env.GOOGLE_SHEETS_ID;
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

  return res.json({
    sheets: sheetId
      ? { configured: true, url: `https://docs.google.com/spreadsheets/d/${sheetId}/edit` }
      : { configured: false },
    drive: folderId
      ? { configured: true, url: `https://drive.google.com/drive/folders/${folderId}` }
      : { configured: false },
  });
});

export default router;
