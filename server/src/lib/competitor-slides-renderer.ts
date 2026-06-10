/**
 * Competitor Weekly Report — Google Slides renderer (v2 revamp)
 *
 * Slide deck structure:
 *   1. Cover          — full-bleed navy, week label, total activity stat
 *   2. Executive Summary — 3 key numbers + AI headline + opportunity signal
 *   3. Market Activity  — horizontal activity bars across all competitors
 *   4. Competitor × N  — per-competitor deep-dive (analysis + post preview)
 *   5. Knowledge Insights — top extracted insights from this week's KB extraction
 *   6. Action Plan      — team tasks with priority indicators
 *   7. Closing          — Qoyod's move this week (3 actions)
 *
 * Palette: navy #162560 · royalBlue #1C4587 · brightBlue #2F75F2
 * Font: Lama Sans · NO turquoise anywhere
 */

import { google } from "googleapis";
import type { WeekDiff } from "./competitor-weekly-report.js";

// ─── Canvas ───────────────────────────────────────────────────────────────────
const W  = 9_144_000;   // 10 in
const H  = 5_143_500;   // 5.625 in
const IN = 914_400;

// ─── Palette ──────────────────────────────────────────────────────────────────
const C = {
  navy:       "#162560",
  navyLight:  "#1E3070",
  royalBlue:  "#1C4587",
  brightBlue: "#2F75F2",
  skyBlue:    "#4A90D9",
  cardBg:     "#F4F5F7",
  cardBorder: "#DDE3EE",
  white:      "#FFFFFF",
  offWhite:   "#F8F9FC",
  textDark:   "#162560",
  textMid:    "#374151",
  textLight:  "#9CA3AF",
  green:      "#166534",
  greenBg:    "#DCFCE7",
  greenBdr:   "#86EFAC",
  greenSolid: "#16A34A",
  red:        "#991B1B",
  redBg:      "#FEE2E2",
  redBdr:     "#FCA5A5",
  redSolid:   "#DC2626",
  amber:      "#92400E",
  amberBg:    "#FEF3C7",
  amberBdr:   "#FCD34D",
  amberSolid: "#D97706",
};

// ─── Auth ─────────────────────────────────────────────────────────────────────
function getClients() {
  const scopes = [
    "https://www.googleapis.com/auth/presentations",
    "https://www.googleapis.com/auth/drive",
  ];
  let credentials: object | undefined;
  const b64 = process.env.GOOGLE_SERVICE_ACCOUNT_B64;
  if (b64) {
    try { credentials = JSON.parse(Buffer.from(b64, "base64").toString("utf8")); } catch { /**/ }
  }
  if (!credentials) {
    const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    if (raw) {
      try { credentials = JSON.parse(raw.trim().replace(/\\n/g, "\n")); } catch { /**/ }
    }
  }
  const auth = credentials
    ? new google.auth.GoogleAuth({ credentials, scopes })
    : new google.auth.GoogleAuth({ scopes });
  return {
    slides: google.slides({ version: "v1", auth }),
    drive:  google.drive({ version: "v3", auth }),
  };
}

// ─── Primitives ───────────────────────────────────────────────────────────────
function rgb(hex: string) {
  const h = hex.replace(/^#/, "");
  if (h.length !== 6) return { red: 0, green: 0, blue: 0 };
  return {
    red:   parseInt(h.slice(0, 2), 16) / 255,
    green: parseInt(h.slice(2, 4), 16) / 255,
    blue:  parseInt(h.slice(4, 6), 16) / 255,
  };
}
const pt  = (n: number) => ({ magnitude: n, unit: "PT" as const });
const emu = (w: number, h: number) => ({
  width:  { magnitude: w, unit: "EMU" as const },
  height: { magnitude: h, unit: "EMU" as const },
});
const pos = (x: number, y: number) => ({
  scaleX: 1, scaleY: 1, translateX: x, translateY: y, unit: "EMU" as const,
});

let _seq = 0;
const eid = (p = "e") => `${p}_${++_seq}_${Date.now() % 1_000_000}`;

function rBox(
  id: string, slideId: string,
  x: number, y: number, w: number, h: number,
  fill: string, borderColor?: string, borderPt = 1,
): any[] {
  return [
    {
      createShape: {
        objectId: id, shapeType: "ROUND_RECTANGLE",
        elementProperties: { pageObjectId: slideId, size: emu(w, h), transform: pos(x, y) },
      },
    },
    {
      updateShapeProperties: {
        objectId: id, fields: "shapeBackgroundFill,outline",
        shapeProperties: {
          shapeBackgroundFill: { solidFill: { color: { rgbColor: rgb(fill) } } },
          outline: borderColor
            ? { outlineFill: { solidFill: { color: { rgbColor: rgb(borderColor) } } }, weight: pt(borderPt) }
            : { propertyState: "NOT_RENDERED" },
        },
      },
    },
  ];
}

function ellipse(
  id: string, slideId: string,
  x: number, y: number, w: number, h: number,
  fill: string,
): any[] {
  return [
    {
      createShape: {
        objectId: id, shapeType: "ELLIPSE",
        elementProperties: { pageObjectId: slideId, size: emu(w, h), transform: pos(x, y) },
      },
    },
    {
      updateShapeProperties: {
        objectId: id, fields: "shapeBackgroundFill,outline",
        shapeProperties: {
          shapeBackgroundFill: { solidFill: { color: { rgbColor: rgb(fill) } } },
          outline: { propertyState: "NOT_RENDERED" },
        },
      },
    },
  ];
}

function newSlide(id: string): any {
  return { createSlide: { objectId: id, slideLayoutReference: { predefinedLayout: "BLANK" } } };
}

function setBg(slideId: string, hex: string): any {
  return {
    updatePageProperties: {
      objectId: slideId, fields: "pageBackgroundFill",
      pageProperties: { pageBackgroundFill: { solidFill: { color: { rgbColor: rgb(hex) } } } },
    },
  };
}

function box(
  id: string, slideId: string,
  x: number, y: number, w: number, h: number,
  fill: string, borderColor?: string, borderPt = 1,
): any[] {
  return [
    {
      createShape: {
        objectId: id, shapeType: "RECTANGLE",
        elementProperties: { pageObjectId: slideId, size: emu(w, h), transform: pos(x, y) },
      },
    },
    {
      updateShapeProperties: {
        objectId: id,
        fields: "shapeBackgroundFill,outline",
        shapeProperties: {
          shapeBackgroundFill: { solidFill: { color: { rgbColor: rgb(fill) } } },
          outline: borderColor
            ? { outlineFill: { solidFill: { color: { rgbColor: rgb(borderColor) } } }, weight: pt(borderPt) }
            : { propertyState: "NOT_RENDERED" },
        },
      },
    },
  ];
}

interface TB {
  text:    string;
  size?:   number;
  color?:  string;
  bold?:   boolean;
  italic?: boolean;
  align?:  "START" | "CENTER" | "END";
  link?:   string;
  lh?:     number; // lineSpacing override
}

function textBox(
  id: string, slideId: string,
  x: number, y: number, w: number, h: number,
  blocks: TB[],
  dir: "RIGHT_TO_LEFT" | "LEFT_TO_RIGHT" = "RIGHT_TO_LEFT",
): any[] {
  const R: any[] = [
    {
      createShape: {
        objectId: id, shapeType: "TEXT_BOX",
        elementProperties: { pageObjectId: slideId, size: emu(w, h), transform: pos(x, y) },
      },
    },
    {
      updateShapeProperties: {
        objectId: id, fields: "shapeBackgroundFill,outline",
        shapeProperties: {
          shapeBackgroundFill: { propertyState: "NOT_RENDERED" },
          outline: { propertyState: "NOT_RENDERED" },
        },
      },
    },
  ];

  const fullText = blocks.map(b => b.text).join("\n");
  R.push({ insertText: { objectId: id, text: fullText, insertionIndex: 0 } });

  let cursor = 0;
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const len = b.text.length;
    const fields = ["foregroundColor", "fontSize", "bold", "italic", "fontFamily"];
    if (b.link) fields.push("link");
    R.push({
      updateTextStyle: {
        objectId: id,
        textRange: { type: "FIXED_RANGE", startIndex: cursor, endIndex: cursor + len },
        fields: fields.join(","),
        style: {
          foregroundColor: { opaqueColor: { rgbColor: rgb(b.color || C.textDark) } },
          fontSize: pt(b.size || 12),
          bold:   b.bold   ?? false,
          italic: b.italic ?? false,
          fontFamily: "Lama Sans",
          ...(b.link ? { link: { url: b.link } } : {}),
        },
      },
    });
    R.push({
      updateParagraphStyle: {
        objectId: id,
        textRange: { type: "FIXED_RANGE", startIndex: cursor, endIndex: cursor + len },
        fields: "alignment,direction,spaceAbove,spaceBelow,lineSpacing",
        style: {
          alignment: b.align || (dir === "RIGHT_TO_LEFT" ? "END" : "START"),
          direction: dir,
          spaceAbove: pt(0),
          spaceBelow: pt(2),
          lineSpacing: b.lh ?? 120,
        },
      },
    });
    cursor += len + (i < blocks.length - 1 ? 1 : 0);
  }
  return R;
}

function txt(
  slideId: string, x: number, y: number, w: number, h: number,
  text: string, opts: Omit<TB, "text"> = {},
  dir: "RIGHT_TO_LEFT" | "LEFT_TO_RIGHT" = "RIGHT_TO_LEFT",
): any[] {
  return textBox(eid("t"), slideId, x, y, w, h, [{ text, ...opts }], dir);
}

// ─── SLIDE 1: COVER ───────────────────────────────────────────────────────────
function coverSlide(slideId: string, weekLabel: string, total: number, compCount: number): any[] {
  const R: any[] = [newSlide(slideId), setBg(slideId, C.navy)];

  // Decorative ellipses top-right (Canva-style background depth)
  R.push(...ellipse(eid(), slideId, W * 0.70, -IN * 1.5, IN * 4.2, IN * 4.2, C.navyLight));
  R.push(...ellipse(eid(), slideId, W * 0.82, -IN * 0.6, IN * 2.2, IN * 2.2, C.royalBlue));
  // Small accent dot bottom-left
  R.push(...ellipse(eid(), slideId, -IN * 0.6, H * 0.6, IN * 2.0, IN * 2.0, C.navyLight));

  // Left bright stripe
  R.push(...box(eid(), slideId, 0, 0, IN * 0.07, H, C.brightBlue));
  // Bottom accent strip
  R.push(...box(eid(), slideId, 0, H - IN * 0.07, W, IN * 0.07, C.brightBlue));

  // Week label pill (rounded)
  R.push(...rBox(eid(), slideId, IN * 0.55, IN * 0.72, IN * 2.4, IN * 0.40, C.brightBlue));
  R.push(...txt(slideId, IN * 0.55, IN * 0.73, IN * 2.4, IN * 0.38,
    weekLabel, { size: 10, color: C.white, bold: true, align: "CENTER" },
  ));

  // Main Arabic title — larger, more dramatic
  R.push(...txt(slideId, IN * 0.55, IN * 1.30, IN * 6.2, IN * 2.0,
    "رصد المنافسين\nالأسبوعي",
    { bold: true, size: 56, color: C.white, lh: 112 },
  ));

  // Subtitle
  R.push(...txt(slideId, IN * 0.55, IN * 3.42, IN * 6.2, IN * 0.44,
    "تقرير ذكاء المنافسين — فريق التسويق الإبداعي",
    { size: 12, color: "#8BA5CC" },
  ));

  // Divider line
  R.push(...box(eid(), slideId, IN * 0.55, IN * 3.34, IN * 2.8, IN * 0.04, C.brightBlue));

  // Stat cards — rounded, floating at bottom
  const sy = H - IN * 1.42;
  const sw = IN * 2.3;
  const sh = IN * 1.15;
  const sx = IN * 0.55;

  // Total activity card
  R.push(...rBox(eid(), slideId, sx, sy, sw, sh, C.navyLight, C.brightBlue, 1.5));
  R.push(...box(eid(), slideId, sx, sy, sw, IN * 0.07, C.brightBlue)); // top accent bar
  R.push(...txt(slideId, sx, sy + IN * 0.14, sw, IN * 0.68,
    String(total),
    { bold: true, size: 44, color: C.white, align: "CENTER" },
  ));
  R.push(...txt(slideId, sx, sy + IN * 0.80, sw, IN * 0.28,
    "نشاط رُصد هذا الأسبوع",
    { size: 9, color: "#8BA5CC", align: "CENTER" },
  ));

  // Competitor count card
  R.push(...rBox(eid(), slideId, sx + sw + IN * 0.22, sy, sw, sh, C.navyLight, C.brightBlue, 1.5));
  R.push(...box(eid(), slideId, sx + sw + IN * 0.22, sy, sw, IN * 0.07, C.brightBlue));
  R.push(...txt(slideId, sx + sw + IN * 0.22, sy + IN * 0.14, sw, IN * 0.68,
    String(compCount),
    { bold: true, size: 44, color: C.white, align: "CENTER" },
  ));
  R.push(...txt(slideId, sx + sw + IN * 0.22, sy + IN * 0.80, sw, IN * 0.28,
    "منافس تحت المراقبة",
    { size: 9, color: "#8BA5CC", align: "CENTER" },
  ));

  // Brand mark bottom right
  R.push(...txt(slideId, W - IN * 2.8, H - IN * 0.55, IN * 2.5, IN * 0.36,
    "قيود · Social Media Artist",
    { size: 9, color: "#8BA5CC", align: "END" },
  ));

  return R;
}

// ─── SLIDE 2: EXECUTIVE SUMMARY ───────────────────────────────────────────────
function execSummarySlide(slideId: string, ai: any, diffs: WeekDiff[], weekLabel: string): any[] {
  const R: any[] = [newSlide(slideId), setBg(slideId, C.offWhite)];

  // Header bar
  R.push(...box(eid(), slideId, 0, 0, W, IN * 0.68, C.navy));
  R.push(...box(eid(), slideId, 0, 0, IN * 0.08, IN * 0.68, C.brightBlue));
  R.push(...txt(slideId, IN * 0.3, IN * 0.12, W * 0.6, IN * 0.48,
    "الملخص التنفيذي",
    { bold: true, size: 19, color: C.white },
  ));
  R.push(...txt(slideId, W * 0.62, IN * 0.16, W * 0.35, IN * 0.38,
    weekLabel,
    { size: 11, color: "#8BA5CC", align: "END" },
  ));

  // AI headline — prominent box
  R.push(...box(eid(), slideId, IN * 0.3, IN * 0.86, W - IN * 0.6, IN * 0.72, C.navy, C.brightBlue, 2));
  R.push(...box(eid(), slideId, IN * 0.3, IN * 0.86, IN * 0.08, IN * 0.72, C.brightBlue));
  R.push(...txt(slideId, IN * 0.55, IN * 0.96, W - IN * 1.1, IN * 0.54,
    ai.headline || "اتجاه الأسبوع",
    { bold: true, size: 15, color: C.white },
  ));

  // Three KPI boxes
  const totalActivity = diffs.reduce((s, d) =>
    s + d.facebook_new + d.google_new + d.instagram_new_posts +
    d.youtube_new_videos + d.tiktok_new_videos + d.snapchat_new_posts + d.linkedin_new_posts, 0);
  const mostActive = diffs.reduce((best, d) => {
    const total = d.facebook_new + d.google_new + d.instagram_new_posts +
      d.youtube_new_videos + d.tiktok_new_videos + d.linkedin_new_posts;
    return total > best.total ? { name: d.competitor, total } : best;
  }, { name: "—", total: 0 });
  const provenWinners = diffs.reduce((s, d) => s + (d.proven_winners?.length || 0), 0);

  const kpis = [
    { num: String(totalActivity), label: "إجمالي النشاط", sub: "عبر جميع المنصات", color: C.brightBlue },
    { num: mostActive.name, label: "الأكثر نشاطاً", sub: `${mostActive.total} منشور`, color: C.amberSolid },
    { num: String(provenWinners), label: "إعلان مثبت", sub: "يعمل أكثر من 30 يوم", color: C.greenSolid },
  ];

  const kw = (W - IN * 0.6 - IN * 0.2 * 2) / 3;
  const ky = IN * 1.74;
  const kh = IN * 1.12;

  for (let i = 0; i < kpis.length; i++) {
    const kx = IN * 0.3 + i * (kw + IN * 0.2);
    const k = kpis[i];
    // Rounded card with top color bar
    R.push(...rBox(eid(), slideId, kx, ky, kw, kh, C.white, C.cardBorder));
    R.push(...box(eid(), slideId, kx, ky, kw, IN * 0.07, k.color));
    R.push(...txt(slideId, kx, ky + IN * 0.14, kw, IN * 0.60,
      k.num,
      { bold: true, size: 34, color: C.navy, align: "CENTER" },
    ));
    R.push(...txt(slideId, kx, ky + IN * 0.76, kw, IN * 0.24,
      k.label,
      { bold: true, size: 10, color: C.textDark, align: "CENTER" },
    ));
    R.push(...txt(slideId, kx, ky + IN * 0.96, kw, IN * 0.2,
      k.sub,
      { size: 8, color: C.textLight, align: "CENTER" },
    ));
  }

  // Notable angles
  const angles = diffs.flatMap(d => d.notable_angles).filter(Boolean).slice(0, 3);
  if (angles.length > 0) {
    const ay = IN * 3.08;
    R.push(...txt(slideId, IN * 0.3, ay, W - IN * 0.6, IN * 0.3,
      "أبرز الرسائل والزوايا الإعلانية هذا الأسبوع:",
      { bold: true, size: 10, color: C.textMid },
    ));

    const aw = (W - IN * 0.6 - IN * 0.15 * (angles.length - 1)) / angles.length;
    for (let i = 0; i < angles.length; i++) {
      const ax = IN * 0.3 + i * (aw + IN * 0.15);
      R.push(...box(eid(), slideId, ax, ay + IN * 0.36, aw, IN * 0.5, C.white, C.cardBorder));
      R.push(...box(eid(), slideId, ax, ay + IN * 0.36, IN * 0.06, IN * 0.5, C.brightBlue));
      R.push(...txt(slideId, ax + IN * 0.18, ay + IN * 0.42, aw - IN * 0.28, IN * 0.38,
        `"${angles[i]}"`,
        { italic: true, size: 9.5, color: C.textMid },
      ));
    }
  }

  // Recommendations — derived from ai.tasks (top 3 titles)
  const actions = (ai.tasks || []).slice(0, 3);
  if (actions.length > 0) {
    const acy = IN * 4.1;
    R.push(...box(eid(), slideId, IN * 0.3, acy, W - IN * 0.6, IN * 0.3, C.navy));
    R.push(...txt(slideId, IN * 0.5, acy + IN * 0.04, W - IN * 1.0, IN * 0.24,
      "توصيات هذا الأسبوع",
      { bold: true, size: 10, color: C.white },
    ));
    for (let i = 0; i < actions.length; i++) {
      const aY = acy + IN * 0.38 + i * IN * 0.28;
      R.push(...box(eid(), slideId, IN * 0.3, aY, IN * 0.3, IN * 0.24, C.brightBlue));
      R.push(...txt(slideId, IN * 0.3, aY, IN * 0.3, IN * 0.24,
        String(i + 1), { bold: true, size: 10, color: C.white, align: "CENTER" },
      ));
      R.push(...txt(slideId, IN * 0.7, aY, W - IN * 1.0, IN * 0.26,
        actions[i].title, { size: 10, color: C.textDark },
      ));
    }
  }

  return R;
}

// ─── SLIDE 3: MARKET ACTIVITY BARS ────────────────────────────────────────────
function marketActivitySlide(slideId: string, diffs: WeekDiff[], weekLabel: string): any[] {
  const R: any[] = [newSlide(slideId), setBg(slideId, C.white)];

  // Header
  R.push(...box(eid(), slideId, 0, 0, W, IN * 0.68, C.navy));
  R.push(...box(eid(), slideId, 0, 0, IN * 0.08, IN * 0.68, C.brightBlue));
  R.push(...txt(slideId, IN * 0.3, IN * 0.12, W * 0.6, IN * 0.48,
    "نشاط المنافسين — المحتوى الأورجانيك",
    { bold: true, size: 19, color: C.white },
  ));
  R.push(...txt(slideId, W * 0.62, IN * 0.16, W * 0.35, IN * 0.38,
    weekLabel, { size: 11, color: "#8BA5CC", align: "END" },
  ));

  // Platform breakdown per competitor — horizontal stacked bars
  // Organic channels only — Google Ads excluded from visual (paid intel stays in Exec Summary text)
  const platforms = [
    { key: "instagram_new_posts", label: "Instagram", color: C.skyBlue },
    { key: "tiktok_new_videos",   label: "TikTok",    color: "#1A1A1A" },
    { key: "youtube_new_videos",  label: "YouTube",   color: C.redSolid },
    { key: "linkedin_new_posts",  label: "LinkedIn",  color: C.amberSolid },
    { key: "snapchat_new_posts",  label: "Snapchat",  color: C.amberBdr },
  ] as const;

  // Legend
  const legX = IN * 0.3;
  const legY = IN * 0.82;
  for (let i = 0; i < platforms.length; i++) {
    const lx = legX + i * IN * 1.45;
    R.push(...box(eid(), slideId, lx, legY, IN * 0.22, IN * 0.18, platforms[i].color));
    R.push(...txt(slideId, lx + IN * 0.28, legY, IN * 1.1, IN * 0.2,
      platforms[i].label,
      { size: 8, color: C.textMid, align: "START" },
      "LEFT_TO_RIGHT",
    ));
  }

  // Find max for scaling
  const maxTotal = Math.max(...diffs.map(d =>
    d.facebook_new + d.google_new + d.instagram_new_posts +
    d.youtube_new_videos + d.tiktok_new_videos + d.linkedin_new_posts,
  ), 1);

  const barAreaX = IN * 2.0;
  const barAreaW = W - barAreaX - IN * 0.3;
  const barH     = IN * 0.55;
  const rowGap   = IN * 0.26;
  const startY   = IN * 1.18;

  for (let i = 0; i < diffs.length; i++) {
    const d = diffs[i];
    const ry = startY + i * (barH + rowGap);

    // Competitor label
    R.push(...txt(slideId, IN * 0.3, ry + IN * 0.1, IN * 1.65, IN * 0.38,
      d.competitor,
      { bold: true, size: 11, color: C.navy },
    ));

    // Background track
    R.push(...box(eid(), slideId, barAreaX, ry, barAreaW, barH, C.cardBg));

    // Stacked segments
    const total = d.instagram_new_posts + d.tiktok_new_videos +
      d.youtube_new_videos + d.linkedin_new_posts + d.snapchat_new_posts;
    const values = [
      d.instagram_new_posts, d.tiktok_new_videos,
      d.youtube_new_videos, d.linkedin_new_posts, d.snapchat_new_posts,
    ];

    let segX = barAreaX;
    for (let j = 0; j < platforms.length; j++) {
      const v = values[j];
      if (v <= 0) continue;
      const segW = (v / maxTotal) * barAreaW;
      R.push(...box(eid(), slideId, segX, ry, segW, barH, platforms[j].color));
      if (segW > IN * 0.35) {
        R.push(...txt(slideId, segX, ry + IN * 0.15, segW, IN * 0.28,
          String(v),
          { bold: true, size: 8, color: C.white, align: "CENTER" },
          "LEFT_TO_RIGHT",
        ));
      }
      segX += segW;
    }

    // Total label
    R.push(...txt(slideId, barAreaX + barAreaW + IN * 0.12, ry + IN * 0.1, IN * 0.8, IN * 0.38,
      String(total),
      { bold: true, size: 13, color: total > 0 ? C.navy : C.textLight, align: "START" },
      "LEFT_TO_RIGHT",
    ));

    // Proven winners badge
    if ((d.proven_winners?.length || 0) > 0) {
      R.push(...box(eid(), slideId, barAreaX + barAreaW - IN * 1.2, ry - IN * 0.02,
        IN * 1.1, IN * 0.28, C.amberBg, C.amberBdr,
      ));
      R.push(...txt(slideId, barAreaX + barAreaW - IN * 1.2, ry, IN * 1.1, IN * 0.26,
        `★ ${d.proven_winners!.length} مثبت`,
        { size: 8, color: C.amber, align: "CENTER" },
      ));
    }
  }

  // Bottom note
  R.push(...txt(slideId, IN * 0.3, H - IN * 0.4, W - IN * 0.6, IN * 0.3,
    "★ مثبت = إعلان يعمل أكثر من 30 يوماً — إشارة ربحية",
    { size: 8, color: C.textLight, italic: true },
  ));

  return R;
}

// ─── SLIDE 4: COMPETITOR DEEP-DIVE ────────────────────────────────────────────
function competitorSlide(slideId: string, d: WeekDiff, ct: any): any[] {
  const R: any[] = [newSlide(slideId), setBg(slideId, C.offWhite)];

  const total = d.facebook_new + d.google_new + d.instagram_new_posts +
    d.youtube_new_videos + d.tiktok_new_videos + d.linkedin_new_posts;

  // Header
  R.push(...box(eid(), slideId, 0, 0, W, IN * 0.68, C.navy));
  R.push(...box(eid(), slideId, 0, 0, IN * 0.08, IN * 0.68, C.brightBlue));
  R.push(...txt(slideId, IN * 0.25, IN * 0.11, W * 0.55, IN * 0.48,
    d.competitor, { bold: true, size: 22, color: C.white },
  ));

  // Activity chips in header
  const chips: { label: string; val: number }[] = [
    { label: "Meta", val: d.facebook_new },
    { label: "Google", val: d.google_new },
    { label: "IG", val: d.instagram_new_posts },
    { label: "TikTok", val: d.tiktok_new_videos },
    { label: "YT", val: d.youtube_new_videos },
    { label: "LI", val: d.linkedin_new_posts },
  ].filter(c => c.val > 0);

  let chipX = W - IN * 0.25;
  for (const chip of chips.reverse()) {
    const cw = IN * 0.75;
    chipX -= cw + IN * 0.1;
    R.push(...box(eid(), slideId, chipX, IN * 0.15, cw, IN * 0.38, C.brightBlue));
    R.push(...txt(slideId, chipX, IN * 0.17, cw, IN * 0.34,
      `${chip.label} ${chip.val}`,
      { size: 8, color: C.white, bold: true, align: "CENTER" },
      "LEFT_TO_RIGHT",
    ));
  }

  // ── LEFT COLUMN (55% width) ──
  const lx = IN * 0.25;
  const lw = IN * 4.85;
  let ly  = IN * 0.82;

  // Summary
  if (ct?.summary) {
    R.push(...box(eid(), slideId, lx, ly, lw, IN * 0.52, C.white, C.cardBorder));
    R.push(...box(eid(), slideId, lx, ly, IN * 0.06, IN * 0.52, C.brightBlue));
    R.push(...txt(slideId, lx + IN * 0.18, ly + IN * 0.08, lw - IN * 0.28, IN * 0.38,
      ct.summary, { size: 10.5, color: C.textMid, italic: true },
    ));
    ly += IN * 0.6;
  }

  // ✅ What they're doing right
  const good = (ct?.good || []).slice(0, 2);
  if (good.length > 0) {
    R.push(...box(eid(), slideId, lx, ly, lw, IN * 0.3, C.greenBg, C.greenBdr));
    R.push(...box(eid(), slideId, lx, ly, IN * 0.06, IN * 0.3, C.greenSolid));
    R.push(...txt(slideId, lx + IN * 0.18, ly + IN * 0.06, lw - IN * 0.28, IN * 0.22,
      "✓  يعملونه صح", { bold: true, size: 9.5, color: C.green },
    ));
    ly += IN * 0.34;
    for (const g of good) {
      R.push(...txt(slideId, lx + IN * 0.18, ly, lw - IN * 0.28, IN * 0.34,
        `•  ${g}`, { size: 9.5, color: C.textDark },
      ));
      ly += IN * 0.35;
    }
    ly += IN * 0.08;
  }

  // ❌ Gaps / weaknesses
  const bad = (ct?.bad || []).slice(0, 2);
  if (bad.length > 0) {
    R.push(...box(eid(), slideId, lx, ly, lw, IN * 0.3, C.redBg, C.redBdr));
    R.push(...box(eid(), slideId, lx, ly, IN * 0.06, IN * 0.3, C.redSolid));
    R.push(...txt(slideId, lx + IN * 0.18, ly + IN * 0.06, lw - IN * 0.28, IN * 0.22,
      "✗  ثغرات نقدر نستغلها", { bold: true, size: 9.5, color: C.red },
    ));
    ly += IN * 0.34;
    for (const b of bad) {
      R.push(...txt(slideId, lx + IN * 0.18, ly, lw - IN * 0.28, IN * 0.34,
        `•  ${b}`, { size: 9.5, color: C.textDark },
      ));
      ly += IN * 0.35;
    }
    ly += IN * 0.08;
  }

  // ⚡ Qoyod advantage
  if (ct?.qoyod_advantage) {
    R.push(...box(eid(), slideId, lx, ly, lw, IN * 0.65, C.navy));
    R.push(...box(eid(), slideId, lx, ly, IN * 0.06, IN * 0.65, C.brightBlue));
    R.push(...textBox(eid(), slideId, lx + IN * 0.18, ly + IN * 0.08, lw - IN * 0.28, IN * 0.52, [
      { text: "⚡ ميزة قيود:  ", bold: true, size: 10, color: C.brightBlue },
      { text: ct.qoyod_advantage, size: 10, color: C.white },
    ]));
  }

  // ── RIGHT COLUMN (top posts) ──
  const rx = IN * 5.3;
  const rw = W - rx - IN * 0.25;
  const samples = d.top_samples.slice(0, 2);
  let ry = IN * 0.82;

  if (samples.length === 0) {
    R.push(...box(eid(), slideId, rx, ry, rw, IN * 0.56, C.cardBg, C.cardBorder));
    R.push(...txt(slideId, rx + IN * 0.1, ry + IN * 0.15, rw - IN * 0.2, IN * 0.28,
      "لا منشورات جديدة هذا الأسبوع",
      { size: 10, color: C.textLight, align: "CENTER" },
    ));
    ry += IN * 0.66;
  }

  for (const s of samples) {
    const slotH = samples.length === 1 ? IN * 3.85 : IN * 1.88;
    R.push(...box(eid(), slideId, rx, ry, rw, slotH, C.white, C.cardBorder));
    // Platform header strip
    R.push(...box(eid(), slideId, rx, ry, rw, IN * 0.3, C.royalBlue));
    R.push(...txt(slideId, rx + IN * 0.12, ry + IN * 0.05, rw - IN * 0.24, IN * 0.22,
      s.source.toUpperCase(),
      { bold: true, size: 8.5, color: C.white, align: "START" },
      "LEFT_TO_RIGHT",
    ));

    let py = ry + IN * 0.36;

    // Image
    if (s.image_url) {
      const imgH = samples.length === 1 ? IN * 2.2 : IN * 1.0;
      try {
        R.push({
          createImage: {
            objectId: eid("img"), url: s.image_url,
            elementProperties: { pageObjectId: slideId, size: emu(rw - IN * 0.2, imgH), transform: pos(rx + IN * 0.1, py) },
          },
        });
        py += imgH + IN * 0.1;
      } catch { /* skip */ }
    }

    // Post text
    const postText = (s.hook || s.body || "").slice(0, 160);
    const textH = slotH - (py - ry) - IN * 0.4;
    if (postText && textH > IN * 0.2) {
      R.push(...txt(slideId, rx + IN * 0.12, py, rw - IN * 0.22, textH,
        `"${postText}"`, { italic: true, size: 9, color: C.textMid },
      ));
    }

    // Link
    if (s.detail_url) {
      R.push(...txt(slideId, rx + IN * 0.12, ry + slotH - IN * 0.35, rw - IN * 0.22, IN * 0.28,
        "← عرض المنشور",
        { bold: true, size: 8.5, color: C.brightBlue, link: s.detail_url, align: "START" },
        "LEFT_TO_RIGHT",
      ));
    }

    ry += slotH + IN * 0.1;
  }

  // Proven winners amber footer
  if ((d.proven_winners?.length || 0) > 0) {
    R.push(...box(eid(), slideId, 0, H - IN * 0.44, W, IN * 0.44, C.amberBg, C.amberBdr));
    R.push(...txt(slideId, IN * 0.3, H - IN * 0.36, W - IN * 0.6, IN * 0.3,
      `★ إعلانات مثبتة (أكثر من 30 يوم):  ${d.proven_winners!.slice(0, 3).join("  ·  ")}`,
      { size: 9, color: C.amber },
    ));
  }

  return R;
}

// ─── SLIDE 5: KNOWLEDGE INSIGHTS ──────────────────────────────────────────────
function knowledgeSlide(slideId: string, insights: string[]): any[] {
  const R: any[] = [newSlide(slideId), setBg(slideId, C.navy)];

  // Header
  R.push(...box(eid(), slideId, 0, 0, W, IN * 0.68, C.royalBlue));
  R.push(...box(eid(), slideId, 0, 0, IN * 0.08, IN * 0.68, C.brightBlue));
  R.push(...txt(slideId, IN * 0.3, IN * 0.12, W * 0.7, IN * 0.48,
    "ما تعلّمناه هذا الأسبوع  —  قاعدة المعرفة",
    { bold: true, size: 18, color: C.white },
  ));

  const cols = 2;
  const cardW = (W - IN * 0.6 - IN * 0.2) / cols;
  const cardH = IN * 0.88;
  const gap   = IN * 0.18;

  for (let i = 0; i < Math.min(insights.length, 8); i++) {
    const col  = i % cols;
    const row  = Math.floor(i / cols);
    const cx   = IN * 0.3 + col * (cardW + IN * 0.2);
    const cy   = IN * 0.88 + row * (cardH + gap);

    // Rounded card
    R.push(...rBox(eid(), slideId, cx, cy, cardW, cardH, C.navyLight, C.brightBlue, 1));
    // Ellipse number badge (Canva-style circle)
    const badgeSize = IN * 0.52;
    const badgeX = cx + IN * 0.16;
    const badgeY = cy + (cardH - badgeSize) / 2;
    R.push(...ellipse(eid(), slideId, badgeX, badgeY, badgeSize, badgeSize, C.brightBlue));
    R.push(...txt(slideId, badgeX, badgeY + IN * 0.10, badgeSize, IN * 0.34,
      String(i + 1),
      { bold: true, size: 15, color: C.white, align: "CENTER" },
      "LEFT_TO_RIGHT",
    ));
    R.push(...txt(slideId, cx + IN * 0.80, cy + IN * 0.14, cardW - IN * 0.92, IN * 0.64,
      insights[i],
      { size: 9.5, color: "#C8D8F0", lh: 130 },
    ));
  }

  // Footer note
  R.push(...txt(slideId, IN * 0.3, H - IN * 0.42, W - IN * 0.6, IN * 0.3,
    "هذه المعرفة تُحقن تلقائياً في كل عملية توليد محتوى — النظام يتعلّم كل أسبوع",
    { size: 8.5, color: "#6B8CB8", italic: true },
  ));

  return R;
}

// ─── SLIDE 6: ACTION PLAN ─────────────────────────────────────────────────────
function actionPlanSlide(
  slideId: string,
  tasks: Array<{ title: string; owner: string; deadline?: string; why?: string }>,
): any[] {
  const R: any[] = [newSlide(slideId), setBg(slideId, C.white)];

  R.push(...box(eid(), slideId, 0, 0, W, IN * 0.68, C.navy));
  R.push(...box(eid(), slideId, 0, 0, IN * 0.08, IN * 0.68, C.brightBlue));
  R.push(...txt(slideId, IN * 0.3, IN * 0.12, W * 0.7, IN * 0.48,
    "مهام الفريق هذا الأسبوع",
    { bold: true, size: 19, color: C.white },
  ));

  const priorityColors = [C.redSolid, C.amberSolid, C.greenSolid, C.brightBlue, C.skyBlue, C.textLight];
  const priorityLabels = ["P1", "P2", "P3", "P4", "P5", "P6"];

  const rh  = IN * 0.68;
  const gap = IN * 0.1;

  for (let i = 0; i < Math.min(tasks.length, 6); i++) {
    const t  = tasks[i];
    const ty = IN * 0.82 + i * (rh + gap);
    const pColor = priorityColors[i] || C.textLight;

    // Rounded card row
    R.push(...rBox(eid(), slideId, IN * 0.3, ty, W - IN * 0.6, rh,
      i % 2 === 0 ? C.cardBg : C.white, C.cardBorder,
    ));

    // Ellipse priority badge
    const bSize = IN * 0.46;
    R.push(...ellipse(eid(), slideId, IN * 0.40, ty + (rh - bSize) / 2, bSize, bSize, pColor));
    R.push(...txt(slideId, IN * 0.40, ty + (rh - bSize) / 2 + IN * 0.10, bSize, IN * 0.28,
      priorityLabels[i],
      { bold: true, size: 10, color: C.white, align: "CENTER" },
      "LEFT_TO_RIGHT",
    ));

    // Task title
    R.push(...txt(slideId, IN * 1.05, ty + IN * 0.06, W - IN * 4.0, IN * 0.36,
      t.title, { bold: true, size: 11.5, color: C.navy },
    ));
    if (t.why) {
      R.push(...txt(slideId, IN * 1.05, ty + IN * 0.40, W - IN * 4.0, IN * 0.24,
        t.why, { italic: true, size: 8.5, color: C.textLight },
      ));
    }

    // Owner · deadline (right side)
    R.push(...txt(slideId, W - IN * 2.9, ty + IN * 0.18, IN * 2.4, IN * 0.34,
      [t.owner, t.deadline].filter(Boolean).join("  ·  "),
      { size: 9, color: C.brightBlue, align: "END" },
    ));
  }

  return R;
}

// ─── SLIDE 7: CLOSING ─────────────────────────────────────────────────────────
function closingSlide(slideId: string, actions: string[], weekLabel: string): any[] {
  const R: any[] = [newSlide(slideId), setBg(slideId, C.navy)];

  // Decorative ellipses for depth (Canva-style)
  R.push(...ellipse(eid(), slideId, -IN * 0.8, H * 0.5, IN * 2.5, IN * 2.5, C.navyLight));
  R.push(...ellipse(eid(), slideId, W * 0.75, -IN * 0.5, IN * 2.8, IN * 2.8, C.navyLight));

  // Top + bottom accent strips
  R.push(...box(eid(), slideId, 0, 0, W, IN * 0.08, C.brightBlue));
  R.push(...box(eid(), slideId, 0, H - IN * 0.08, W, IN * 0.08, C.brightBlue));

  // Title
  R.push(...txt(slideId, IN * 0.5, IN * 0.44, W - IN * 1.0, IN * 0.72,
    "خطوة قيود هذا الأسبوع",
    { bold: true, size: 36, color: C.white },
  ));
  R.push(...txt(slideId, IN * 0.5, IN * 1.24, W - IN * 1.0, IN * 0.36,
    weekLabel, { size: 12, color: C.brightBlue },
  ));

  // Rule
  R.push(...box(eid(), slideId, IN * 0.5, IN * 1.68, IN * 2.2, IN * 0.05, C.brightBlue));

  // Action cards — rounded, with ellipse number circles
  const displayActions = actions.length > 0 ? actions.slice(0, 3) : [
    "لا توجد توصيات محددة هذا الأسبوع",
  ];
  const aw = (W - IN * 1.0 - IN * 0.22 * (displayActions.length - 1)) / displayActions.length;
  const ay = IN * 2.0;
  const ah = IN * 2.3;

  for (let i = 0; i < displayActions.length; i++) {
    const ax = IN * 0.5 + i * (aw + IN * 0.22);
    // Rounded card
    R.push(...rBox(eid(), slideId, ax, ay, aw, ah, C.navyLight, C.brightBlue, 1.5));
    // Top accent bar
    R.push(...box(eid(), slideId, ax, ay, aw, IN * 0.07, C.brightBlue));
    // Ellipse number circle
    const numSize = IN * 0.60;
    const numX = ax + (aw - numSize) / 2;
    R.push(...ellipse(eid(), slideId, numX, ay + IN * 0.20, numSize, numSize, C.brightBlue));
    R.push(...txt(slideId, numX, ay + IN * 0.33, numSize, IN * 0.38,
      String(i + 1),
      { bold: true, size: 24, color: C.white, align: "CENTER" },
      "LEFT_TO_RIGHT",
    ));
    // Action text
    R.push(...txt(slideId, ax + IN * 0.2, ay + IN * 0.96, aw - IN * 0.4, ah - IN * 1.10,
      displayActions[i],
      { size: 11, color: "#C8D8F0", lh: 135 },
    ));
  }

  // Footer
  R.push(...txt(slideId, IN * 0.5, H - IN * 0.52, W - IN * 1.0, IN * 0.32,
    "قيود · Social Media Artist  —  النظام يتعلم ويتطور كل أسبوع",
    { size: 9, color: "#4A6A9C" },
  ));

  return R;
}

// ─── MAIN EXPORT ─────────────────────────────────────────────────────────────
export interface AIOutput {
  headline?: string;
  competitors?: Array<{
    name: string; summary: string;
    good?: string[]; bad?: string[]; qoyod_advantage?: string;
  }>;
  tasks?: Array<{ title: string; owner: string; deadline?: string; why?: string }>;
  alert?: string | null;
}

export async function createWeeklySlidesPresentation(
  diffs: WeekDiff[],
  ai: AIOutput,
  weekLabel: string,
): Promise<{ ok: boolean; link?: string; error?: string }> {
  const FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID ?? "";
  if (!FOLDER_ID) return { ok: false, error: "GOOGLE_DRIVE_FOLDER_ID not configured" };

  try {
    const { slides, drive } = getClients();

    const driveFile = await drive.files.create({
      requestBody: {
        name: `رصد المنافسين — ${weekLabel}`,
        mimeType: "application/vnd.google-apps.presentation",
        parents: [FOLDER_ID],
      },
      supportsAllDrives: true,
      fields: "id,webViewLink",
    });
    const presId = driveFile.data.id!;

    const presInfo = await slides.presentations.get({ presentationId: presId });
    const defaultSlide = presInfo.data.slides?.[0];

    const total = diffs.reduce((s, d) =>
      s + d.facebook_new + d.google_new + d.instagram_new_posts +
      d.youtube_new_videos + d.tiktok_new_videos + d.snapchat_new_posts + d.linkedin_new_posts, 0);

    const requests: any[] = [];
    if (defaultSlide?.objectId) requests.push({ deleteObject: { objectId: defaultSlide.objectId } });

    // 1. Cover
    requests.push(...coverSlide(eid("slide"), weekLabel, total, diffs.length));

    // 2. Executive summary
    requests.push(...execSummarySlide(eid("slide"), ai, diffs, weekLabel));

    // 3. Market activity bars
    requests.push(...marketActivitySlide(eid("slide"), diffs, weekLabel));

    // 4. Per-competitor deep-dives
    for (const d of diffs) {
      const act = d.facebook_new + d.google_new + d.instagram_new_posts +
        d.youtube_new_videos + d.tiktok_new_videos + d.linkedin_new_posts;
      if (act === 0 && d.facebook_paused === 0 && !d.proven_winners?.length) continue;
      const ct = (ai.competitors || []).find(
        c => c.name.toLowerCase() === d.competitor.toLowerCase(),
      );
      requests.push(...competitorSlide(eid("slide"), d, ct));
    }

    // 5. Knowledge insights (top 8 from notable angles + recommended actions)
    const insights = [
      ...diffs.flatMap(d => (d.notable_angles || []).map(a => `${d.competitor}: ${a}`)),
      ...(ai.tasks || []).map(t => t.title),
    ].filter(Boolean).slice(0, 8);
    if (insights.length > 0) {
      requests.push(...knowledgeSlide(eid("slide"), insights));
    }

    // 6. Action plan
    if ((ai.tasks || []).length > 0) {
      requests.push(...actionPlanSlide(eid("slide"), ai.tasks!));
    }

    // 7. Closing — Qoyod's move
    requests.push(...closingSlide(eid("slide"), (ai.tasks || []).map(t => t.title), weekLabel));

    await slides.presentations.batchUpdate({ presentationId: presId, requestBody: { requests } });

    return {
      ok: true,
      link: driveFile.data.webViewLink ?? `https://docs.google.com/presentation/d/${presId}/edit`,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
