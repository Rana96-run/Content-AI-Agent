import { Router } from "express";
import { sheetsAppendHypothesis, sheetsReadWinners, sheetsLogActivity } from "../lib/sheets-client.js";
import { bustPatternLibraryCache } from "../lib/pattern-library.js";
import { logger } from "../lib/logger.js";

const router = Router();

/* ─── POST /api/hypothesis/log ────────────────────────────────────────────
   Logs a creative hypothesis to the Google Sheet "Hypothesis Ledger" tab.
   This is the foundation of the self-learning loop in the master prompt §3.

   Body: {
     id: "Q-2026-W17-014",
     hypothesis: "Fear angle on ZATCA fines outperforms simplicity for retail",
     expected_lift: "+15% CTR vs control",
     atomic_id, sector, channel, funnel_stage  (all optional)
   }

   Use cases:
   - Content tab: log hypothesis when a creative is generated
   - Campaign tab: log overall campaign thesis
   - Manual: log a hypothesis from outside the app
*/
router.post("/hypothesis/log", async (req, res) => {
  const {
    id,
    hypothesis,
    expected_lift,
    actual_result,
    verdict,
    lesson,
    atomic_id,
    sector,
    channel,
    funnel_stage,
  } = req.body ?? {};

  if (!id || !hypothesis) {
    res.status(400).json({ error: "id and hypothesis are required" });
    return;
  }

  try {
    await sheetsAppendHypothesis({
      id: String(id),
      shipped_at: new Date().toISOString(),
      hypothesis: String(hypothesis),
      expected_lift,
      actual_result,
      verdict,
      lesson,
      atomic_id,
      sector,
      channel,
      funnel_stage,
    });
    // If this is a WIN, invalidate the Pattern Library cache so next /api/generate
    // call picks it up immediately (D1 — closing the learning loop)
    if (verdict === "WIN") bustPatternLibraryCache();
    sheetsLogActivity("hypothesis", `Hypothesis logged [${verdict ?? "PENDING"}]: ${String(hypothesis).slice(0, 80)}`, 1).catch(() => {});
    logger.info({ id, hypothesis: String(hypothesis).slice(0, 80), verdict }, "hypothesis: logged");
    res.status(200).json({ ok: true, id });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

/* ─── GET /api/hypothesis/help ────────────────────────────────────────────
   Returns the schema + example, so the team knows how to log from anywhere. */
router.get("/hypothesis/help", (_req, res) => {
  res.status(200).json({
    schema: {
      id: "Q-YYYY-Wnn-NNN",
      hypothesis: "If X then Y because Z",
      expected_lift: "+15% CTR vs control",
      actual_result: "+17% CTR over 7 days",
      verdict: "WIN | LOSS | INCONCLUSIVE | PENDING",
      lesson: "What this teaches us going forward",
      atomic_id: "optional — ties back to the creative brief",
      sector: "Retail | F&B | Consulting | Construction | Tech | General",
      channel: "Meta | Instagram | TikTok | Snapchat | LinkedIn | Twitter | Google Ads | YouTube",
      funnel_stage: "TOF | MOF | BOF",
    },
    example_post: {
      id: "Q-2026-W17-014",
      hypothesis:
        "Fear angle on ZATCA fines outperforms simplicity angle for Tier-A retail in Riyadh",
      expected_lift: "+15% CTR vs control",
      sector: "Retail",
      channel: "Meta",
      funnel_stage: "TOF",
    },
  });
});

/* ─── GET /api/hypothesis/stats ──────────────────────────────────────────
   Returns pattern-library win count for the agent dashboard. */
router.get("/hypothesis/stats", async (_req, res) => {
  try {
    const winners = await sheetsReadWinners(100);
    res.status(200).json({
      ok: true,
      win_count: winners.length,
      last_id: winners[0]?.id ?? null,
    });
  } catch (err) {
    // Non-fatal — sheets may not be configured
    res.status(200).json({ ok: true, win_count: 0, last_id: null });
  }
});

export default router;
