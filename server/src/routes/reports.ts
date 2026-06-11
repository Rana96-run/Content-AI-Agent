import { Router } from "express";
import { logger } from "../lib/logger.js";
import { driveUploadAsGoogleDoc } from "./drive.js";

const router = Router();

/* ─── REPORTING ENDPOINTS ─────────────────────────────────────────────────
   Master prompt §9 — three reporting cadences:
     §9.1 Daily Pulse (max 6 lines, today's spend/CPL/CAC vs target)
     §9.2 Weekly Creative Report (Friday — already exists via competitor-monitor)
     §9.3 Monthly Strategic Review (ICP/sector/funnel breakdowns + pattern updates)
     §9.4 Quarterly Narrative Audit (manual deep dive)

   These endpoints expect upstream data (ad metrics, conversions) that are
   NOT yet wired in this codebase — so they accept the metrics as input and
   produce the structured report. When ad-metric integrations are added (Meta
   Marketing API, Google Ads API), the inputs auto-flow.

   For now, each endpoint accepts a JSON body of metrics and returns the
   formatted report (markdown + Slack blocks if requested).
*/

interface DailyPulseInput {
  date?: string;
  spend?: number;
  spend_target?: number;
  cpl?: number;
  cpl_target?: number;
  cac?: number;
  cac_target?: number;
  top_performer?: { creative_id: string; metric: string; value: string; why: string };
  worst_performer?: { creative_id: string; metric: string; value: string; verdict: "kill" | "iterate" | "hold" };
  anomaly?: string;
  one_action?: string;
}

/* ─── POST /api/reports/daily-pulse ────────────────────────────────────── */
router.post("/reports/daily-pulse", (req, res) => {
  const d = (req.body ?? {}) as DailyPulseInput;
  const today = d.date || new Date().toISOString().slice(0, 10);
  const fmt = (v?: number) => (v === undefined || v === null ? "—" : String(v));
  const vsTarget = (actual?: number, target?: number) =>
    actual === undefined || target === undefined
      ? ""
      : actual <= target
      ? ` ✅ vs ${target}`
      : ` ⚠ vs ${target}`;

  const markdown = `**Daily Pulse — ${today}**
Spend: ${fmt(d.spend)}${vsTarget(d.spend, d.spend_target)}  ·  CPL: ${fmt(d.cpl)}${vsTarget(d.cpl, d.cpl_target)}  ·  CAC: ${fmt(d.cac)}${vsTarget(d.cac, d.cac_target)}
Top performer:    ${d.top_performer ? `\`${d.top_performer.creative_id}\` (${d.top_performer.metric}=${d.top_performer.value}) — ${d.top_performer.why}` : "—"}
Worst performer:  ${d.worst_performer ? `\`${d.worst_performer.creative_id}\` (${d.worst_performer.metric}=${d.worst_performer.value}) — ${d.worst_performer.verdict}` : "—"}
Anomaly: ${d.anomaly || "—"}
One action for tomorrow: ${d.one_action || "—"}`;

  driveUploadAsGoogleDoc(`Daily Pulse — ${today}`, markdown, "Reports").catch(err =>
    logger.warn({ err: String(err) }, "reports: daily-pulse drive save failed (non-fatal)")
  );
  res.status(200).json({
    ok: true,
    date: today,
    markdown,
    summary: `Spend ${fmt(d.spend)} · CPL ${fmt(d.cpl)} · CAC ${fmt(d.cac)}`,
  });
});

/* ─── POST /api/reports/monthly-strategic ──────────────────────────────── */
interface MonthlyStrategicInput {
  month?: string;
  icp_breakdown?: Array<{ tier: "A" | "B" | "C"; cac: number; conversion: number }>;
  sector_breakdown?: Array<{ sector: string; cac: number; volume: number }>;
  funnel_breakdown?: Array<{ stage: "TOF" | "MOF" | "BOF"; ctr: number; cpl: number }>;
  patterns_promoted?: Array<{ id: string; name: string; lift: string }>;
  patterns_retired?: Array<{ id: string; name: string; reason: string }>;
  brand_health?: { sentiment: number; share_of_voice: string };
  recommendations?: string[];
}

router.post("/reports/monthly-strategic", (req, res) => {
  const d = (req.body ?? {}) as MonthlyStrategicInput;
  const month = d.month || new Date().toISOString().slice(0, 7);

  const sections: string[] = [];
  sections.push(`# Monthly Strategic Review — ${month}`);

  if (d.icp_breakdown?.length) {
    sections.push("## ICP Tier Performance");
    sections.push(d.icp_breakdown.map((t) => `- **Tier ${t.tier}:** CAC ${t.cac}, conversion ${t.conversion}%`).join("\n"));
  }

  if (d.sector_breakdown?.length) {
    sections.push("## Sector Performance");
    sections.push(d.sector_breakdown.map((s) => `- **${s.sector}:** CAC ${s.cac}, volume ${s.volume}`).join("\n"));
  }

  if (d.funnel_breakdown?.length) {
    sections.push("## Funnel-Stage Performance");
    sections.push(d.funnel_breakdown.map((f) => `- **${f.stage}:** CTR ${f.ctr}%, CPL ${f.cpl}`).join("\n"));
  }

  if (d.patterns_promoted?.length) {
    sections.push("## Patterns Promoted to Templates (5+ wins)");
    sections.push(d.patterns_promoted.map((p) => `- \`${p.id}\` **${p.name}** — ${p.lift}`).join("\n"));
  }

  if (d.patterns_retired?.length) {
    sections.push("## Patterns Retired (3+ losses)");
    sections.push(d.patterns_retired.map((p) => `- \`${p.id}\` **${p.name}** — ${p.reason}`).join("\n"));
  }

  if (d.brand_health) {
    sections.push("## Brand Health");
    sections.push(`- Sentiment: ${d.brand_health.sentiment}\n- Share of voice vs competitors: ${d.brand_health.share_of_voice}`);
  }

  if (d.recommendations?.length) {
    sections.push("## Recommendations for Next Month");
    sections.push(d.recommendations.map((r, i) => `${i + 1}. ${r}`).join("\n"));
  }

  if (sections.length === 1) {
    sections.push("_No data provided — pass icp_breakdown, sector_breakdown, etc._");
  }

  const markdown = sections.join("\n\n");
  driveUploadAsGoogleDoc(`Monthly Strategic Review — ${month}`, markdown, "Reports").catch(err =>
    logger.warn({ err: String(err) }, "reports: monthly-strategic drive save failed (non-fatal)")
  );
  res.status(200).json({ ok: true, month, markdown });
});

/* ─── GET /api/reports/help ──────────────────────────────────────────── */
router.get("/reports/help", (_req, res) => {
  res.status(200).json({
    daily_pulse: {
      method: "POST",
      path: "/api/reports/daily-pulse",
      example: {
        spend: 4200,
        spend_target: 4500,
        cpl: 38,
        cpl_target: 45,
        cac: 220,
        cac_target: 250,
        top_performer: {
          creative_id: "Q-2026-W17-014",
          metric: "CTR",
          value: "2.8%",
          why: "Fear hook on ZATCA fines is winning for Tier-A retail",
        },
        worst_performer: {
          creative_id: "Q-2026-W17-009",
          metric: "CPL",
          value: "98",
          verdict: "kill",
        },
        anomaly: "Snapchat CPL up 3x — investigating audience overlap",
        one_action: "Pause Q-W17-009 + scale Q-W17-014 by +20%",
      },
    },
    monthly_strategic: {
      method: "POST",
      path: "/api/reports/monthly-strategic",
      example: {
        icp_breakdown: [
          { tier: "A", cac: 180, conversion: 12 },
          { tier: "B", cac: 240, conversion: 7 },
        ],
        sector_breakdown: [
          { sector: "Retail", cac: 165, volume: 42 },
          { sector: "F&B", cac: 195, volume: 28 },
        ],
        funnel_breakdown: [
          { stage: "TOF", ctr: 1.8, cpl: 32 },
          { stage: "MOF", ctr: 2.4, cpl: 52 },
          { stage: "BOF", ctr: 3.1, cpl: 78 },
        ],
        recommendations: [
          "Reallocate 25% of Snapchat budget to TikTok (better CTR for Tier-A)",
          "Test ZATCA wave 5 angle in F&B sector",
        ],
      },
    },
  });
});

export default router;
