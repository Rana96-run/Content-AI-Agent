/**
 * Competitor Weekly Social Listening Report — Google Slides renderer.
 *
 * Design:
 *   Cover      — Deep navy gradient, large title, stat boxes
 *   Summary    — White bg, teal header, AI headline + platform grid
 *   Competitor — White bg (one per active competitor): full analysis +
 *                top social post text & link
 *   Tasks      — White bg, numbered action cards
 *   Alert      — Red bg (only when AI flags urgent)
 */

import { google } from "googleapis";
import type { WeekDiff } from "./competitor-weekly-report.js";

// ─── Slide dimensions ────────────────────────────────────────────────────────
const W = 9_144_000;    // 10 inches in EMU
const H = 5_143_500;    // 5.625 inches in EMU
const IN = 914_400;     // 1 inch

// ─── Brand palette ───────────────────────────────────────────────────────────
const P = {
  navy:     "#021544",
  navyMid:  "#0a2860",   // lighter navy for cards on dark bg
  navyLight:"#1a3a6a",   // even lighter for hover/borders
  teal:     "#17a3a3",
  tealDark: "#0e7070",
  tealBg:   "#e8f7f7",   // very light teal for boxes on white
  white:    "#ffffff",
  offWhite: "#f5f8fa",
  grayLight:"#e2eaee",
  gray:     "#6a96aa",
  textDark: "#021544",
  textMid:  "#2e5468",
  green:    "#15803d",
  greenBg:  "#f0fdf4",
  greenBorder: "#86efac",
  red:      "#b91c1c",
  redBg:    "#fef2f2",
  redBorder:"#fca5a5",
  amber:    "#b45309",
  amberBg:  "#fffbeb",
  amberBorder:"#fcd34d",
};

// ─── Auth ────────────────────────────────────────────────────────────────────
function getClients() {
  const scopes = [
    "https://www.googleapis.com/auth/presentations",
    "https://www.googleapis.com/auth/drive",
  ];
  const b64 = process.env.GOOGLE_SERVICE_ACCOUNT_B64;
  let credentials: object | undefined;
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

// ─── Helpers ─────────────────────────────────────────────────────────────────
function rgb(hex: string) {
  // Only accept 6-char hex strings — no rgba, no named colors
  const h = hex.replace(/^#/, "");
  if (h.length !== 6) return { red: 0, green: 0, blue: 0 };
  return {
    red:   parseInt(h.slice(0, 2), 16) / 255,
    green: parseInt(h.slice(2, 4), 16) / 255,
    blue:  parseInt(h.slice(4, 6), 16) / 255,
  };
}
function pt(n: number) { return { magnitude: n, unit: "PT" as const }; }

let _seq = 0;
function id(prefix = "e") { return `${prefix}_${++_seq}_${Date.now() % 1_000_000}`; }

// Set slide background
function bgReq(slideId: string, hex: string): any {
  return {
    updatePageProperties: {
      objectId: slideId,
      fields: "pageBackgroundFill",
      pageProperties: {
        pageBackgroundFill: { solidFill: { color: { rgbColor: rgb(hex) } } },
      },
    },
  };
}

// Create a filled + optionally bordered rectangle shape
function rect(
  eid: string, slideId: string,
  x: number, y: number, w: number, h: number,
  fill: string, borderColor?: string, borderPt = 1,
): any[] {
  return [
    {
      createShape: {
        objectId: eid,
        shapeType: "RECTANGLE",
        elementProperties: {
          pageObjectId: slideId,
          size: { width: { magnitude: w, unit: "EMU" }, height: { magnitude: h, unit: "EMU" } },
          transform: { scaleX: 1, scaleY: 1, translateX: x, translateY: y, unit: "EMU" },
        },
      },
    },
    {
      updateShapeProperties: {
        objectId: eid,
        fields: "shapeBackgroundFill,outline",
        shapeProperties: {
          shapeBackgroundFill: { solidFill: { color: { rgbColor: rgb(fill) } } },
          outline: {
            outlineFill: { solidFill: { color: { rgbColor: rgb(borderColor || fill) } } },
            weight: pt(borderColor ? borderPt : 0),
          },
        },
      },
    },
  ];
}

// Text block definition
interface TB {
  text: string;
  bold?: boolean;
  italic?: boolean;
  size?: number;        // pt
  color?: string;       // hex
  align?: "START" | "CENTER" | "END";
  link?: string;
}

// Create a text box with styled runs
function textBox(
  eid: string, slideId: string,
  x: number, y: number, w: number, h: number,
  blocks: TB[],
): any[] {
  const reqs: any[] = [
    {
      createShape: {
        objectId: eid,
        shapeType: "TEXT_BOX",
        elementProperties: {
          pageObjectId: slideId,
          size: { width: { magnitude: w, unit: "EMU" }, height: { magnitude: h, unit: "EMU" } },
          transform: { scaleX: 1, scaleY: 1, translateX: x, translateY: y, unit: "EMU" },
        },
      },
    },
    {
      updateShapeProperties: {
        objectId: eid,
        fields: "shapeBackgroundFill,outline",
        shapeProperties: {
          shapeBackgroundFill: { propertyState: "NOT_RENDERED" },
          outline: { propertyState: "NOT_RENDERED" },
        },
      },
    },
  ];

  const fullText = blocks.map(b => b.text).join("\n");
  reqs.push({ insertText: { objectId: eid, text: fullText, insertionIndex: 0 } });

  let cursor = 0;
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const len = b.text.length;

    const styleFields = ["foregroundColor", "fontSize", "bold", "italic"];
    if (b.link) styleFields.push("link");

    reqs.push({
      updateTextStyle: {
        objectId: eid,
        textRange: { type: "FIXED_RANGE", startIndex: cursor, endIndex: cursor + len },
        fields: styleFields.join(","),
        style: {
          foregroundColor: { opaqueColor: { rgbColor: rgb(b.color || P.textDark) } },
          fontSize: pt(b.size || 12),
          bold:   b.bold   ?? false,
          italic: b.italic ?? false,
          ...(b.link ? { link: { url: b.link } } : {}),
        },
      },
    });

    reqs.push({
      updateParagraphStyle: {
        objectId: eid,
        textRange: { type: "FIXED_RANGE", startIndex: cursor, endIndex: cursor + len },
        fields: "alignment,direction,spaceAbove,spaceBelow,lineSpacing",
        style: {
          alignment: b.align || "END",
          direction: "RIGHT_TO_LEFT",
          spaceAbove: pt(1),
          spaceBelow: pt(1),
          lineSpacing: 120,
        },
      },
    });

    cursor += len + (i < blocks.length - 1 ? 1 : 0);
  }

  return reqs;
}

// Convenience: single-run text box
function txt(
  slideId: string,
  x: number, y: number, w: number, h: number,
  text: string,
  opts: Omit<TB, "text"> = {},
): any[] {
  return textBox(id("t"), slideId, x, y, w, h, [{ text, ...opts }]);
}

// Insert image from URL
function img(slideId: string, url: string, x: number, y: number, w: number, h: number): any {
  return {
    createImage: {
      objectId: id("img"),
      url,
      elementProperties: {
        pageObjectId: slideId,
        size: { width: { magnitude: w, unit: "EMU" }, height: { magnitude: h, unit: "EMU" } },
        transform: { scaleX: 1, scaleY: 1, translateX: x, translateY: y, unit: "EMU" },
      },
    },
  };
}

// ─── COVER SLIDE ─────────────────────────────────────────────────────────────
function coverSlide(slideId: string, weekLabel: string, total: number, compCount: number): any[] {
  const R: any[] = [{ createSlide: { objectId: slideId, slideLayoutReference: { predefinedLayout: "BLANK" } } }];

  // Background: deep navy
  R.push(bgReq(slideId, P.navy));

  // Left teal accent bar (full height, 0.35in wide)
  R.push(...rect(id("bar"), slideId, 0, 0, IN * 0.35, H, P.teal));

  // Right subtle bar (full height, 0.08in) — creates framing
  R.push(...rect(id("bar2"), slideId, W - IN * 0.08, 0, IN * 0.08, H, P.tealDark));

  // Title — large, white, bold
  R.push(...txt(slideId, IN * 0.55, IN * 1.3, W - IN * 1.1, IN * 1.4,
    "رصد المنافسين\nالأسبوعي",
    { bold: true, size: 44, color: P.white, align: "START" },
  ));

  // Week label
  R.push(...txt(slideId, IN * 0.55, IN * 2.85, W - IN * 1.1, IN * 0.55,
    weekLabel,
    { size: 18, color: P.teal, align: "START" },
  ));

  // Divider line
  R.push(...rect(id("div"), slideId, IN * 0.55, IN * 3.55, IN * 4, IN * 0.025, P.teal));

  // Stat cards
  const cardW = IN * 2.2;
  const cardH = IN * 0.95;
  const cardY = IN * 3.8;
  const gap   = IN * 0.25;
  const startX = IN * 0.55;

  // Card 1 — total activity
  R.push(...rect(id("c1"), slideId, startX, cardY, cardW, cardH, P.navyMid, P.teal));
  R.push(...txt(slideId, startX, cardY + IN * 0.08, cardW, IN * 0.55,
    String(total),
    { bold: true, size: 30, color: P.teal, align: "CENTER" },
  ));
  R.push(...txt(slideId, startX, cardY + IN * 0.58, cardW, IN * 0.3,
    "نشاط رُصد هذا الأسبوع",
    { size: 10, color: P.gray, align: "CENTER" },
  ));

  // Card 2 — competitor count
  R.push(...rect(id("c2"), slideId, startX + cardW + gap, cardY, cardW, cardH, P.navyMid, P.teal));
  R.push(...txt(slideId, startX + cardW + gap, cardY + IN * 0.08, cardW, IN * 0.55,
    String(compCount),
    { bold: true, size: 30, color: P.teal, align: "CENTER" },
  ));
  R.push(...txt(slideId, startX + cardW + gap, cardY + IN * 0.58, cardW, IN * 0.3,
    "منافس تحت المراقبة",
    { size: 10, color: P.gray, align: "CENTER" },
  ));

  // Brand footer
  R.push(...txt(slideId, IN * 0.55, H - IN * 0.45, W - IN * 1, IN * 0.3,
    "Somaa — وكيل المحتوى الذكي لقيود",
    { size: 9, color: P.gray, align: "START" },
  ));

  return R;
}

// ─── SUMMARY SLIDE ───────────────────────────────────────────────────────────
function summarySlide(slideId: string, ai: any, diffs: WeekDiff[], weekLabel: string): any[] {
  const R: any[] = [
    { createSlide: { objectId: slideId, slideLayoutReference: { predefinedLayout: "BLANK" } } },
    bgReq(slideId, P.white),
  ];

  // Teal header bar
  R.push(...rect(id("hdr"), slideId, 0, 0, W, IN * 0.6, P.teal));
  R.push(...txt(slideId, IN * 0.4, IN * 0.08, W - IN * 0.8, IN * 0.46,
    `ملخّص الأسبوع  ·  ${weekLabel}`,
    { bold: true, size: 16, color: P.white },
  ));

  // AI Headline box
  R.push(...rect(id("hl"), slideId, IN * 0.35, IN * 0.75, W - IN * 0.7, IN * 0.68, P.tealBg, P.teal));
  R.push(...txt(slideId, IN * 0.5, IN * 0.82, W - IN * 1, IN * 0.55,
    ai.headline || "اتجاه الأسبوع",
    { bold: true, size: 17, color: P.navy },
  ));

  // Per-competitor activity cards
  const active = diffs.filter(d =>
    d.facebook_new + d.google_new + d.instagram_new_posts +
    d.youtube_new_videos + d.tiktok_new_videos + d.linkedin_new_posts > 0
  );
  const cardW = Math.min((W - IN * 0.7) / Math.max(active.length, 1) - IN * 0.15, IN * 2.0);
  const cardY = IN * 1.6;
  const cardH = IN * 1.8;

  for (let i = 0; i < diffs.length; i++) {
    const d = diffs[i];
    const total = d.facebook_new + d.google_new + d.instagram_new_posts +
                  d.youtube_new_videos + d.tiktok_new_videos + d.linkedin_new_posts;
    const cx = IN * 0.35 + i * (cardW + IN * 0.15);

    R.push(...rect(id("cc"), slideId, cx, cardY, cardW, cardH,
      total > 0 ? P.offWhite : P.white,
      total > 0 ? P.teal : P.grayLight,
    ));

    // Competitor name
    R.push(...txt(slideId, cx + IN * 0.1, cardY + IN * 0.1, cardW - IN * 0.2, IN * 0.38,
      d.competitor,
      { bold: true, size: 13, color: P.navy, align: "CENTER" },
    ));

    // Platform lines
    const lines: string[] = [];
    if (d.instagram_new_posts > 0)  lines.push(`Instagram  ${d.instagram_new_posts}`);
    if (d.tiktok_new_videos > 0)    lines.push(`TikTok  ${d.tiktok_new_videos}`);
    if (d.youtube_new_videos > 0)   lines.push(`YouTube  ${d.youtube_new_videos}`);
    if (d.linkedin_new_posts > 0)   lines.push(`LinkedIn  ${d.linkedin_new_posts}`);
    if (d.facebook_new > 0)         lines.push(`Meta Ads  ${d.facebook_new}`);
    if (d.google_new > 0)           lines.push(`Google  ${d.google_new}`);
    if (lines.length === 0)         lines.push("لا تغيير");

    R.push(...txt(slideId, cx + IN * 0.1, cardY + IN * 0.52, cardW - IN * 0.2, cardH - IN * 0.6,
      lines.join("\n"),
      { size: 10, color: total > 0 ? P.teal : P.gray, align: "CENTER" },
    ));
  }

  // Notable angles section
  const angles = diffs.flatMap(d => d.notable_angles).filter(Boolean).slice(0, 4);
  if (angles.length > 0) {
    const secY = IN * 3.6;
    R.push(...txt(slideId, IN * 0.35, secY, W - IN * 0.7, IN * 0.32,
      "أبرز الرسائل والزوايا التي رصدناها:",
      { bold: true, size: 11, color: P.textMid },
    ));
    for (let i = 0; i < angles.length; i++) {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const aw = (W - IN * 0.85) / 2;
      const ax = IN * 0.35 + col * (aw + IN * 0.15);
      const ay = secY + IN * 0.35 + row * IN * 0.5;
      R.push(...rect(id("ang"), slideId, ax, ay, aw, IN * 0.42, P.offWhite, P.grayLight));
      R.push(...txt(slideId, ax + IN * 0.15, ay + IN * 0.05, aw - IN * 0.2, IN * 0.35,
        `"${angles[i]}"`,
        { italic: true, size: 10, color: P.textMid },
      ));
    }
  }

  return R;
}

// ─── COMPETITOR SLIDE ─────────────────────────────────────────────────────────
function competitorSlide(slideId: string, d: WeekDiff, ct: any): any[] {
  const R: any[] = [
    { createSlide: { objectId: slideId, slideLayoutReference: { predefinedLayout: "BLANK" } } },
    bgReq(slideId, P.white),
  ];

  // ── Header bar (navy) ──
  R.push(...rect(id("hdr"), slideId, 0, 0, W, IN * 0.65, P.navy));

  // Teal left accent in header
  R.push(...rect(id("hac"), slideId, 0, 0, IN * 0.08, IN * 0.65, P.teal));

  // Competitor name
  R.push(...txt(slideId, IN * 0.25, IN * 0.08, W * 0.55, IN * 0.5,
    d.competitor,
    { bold: true, size: 22, color: P.white },
  ));

  // Activity summary (right side of header)
  const actParts: string[] = [];
  if (d.instagram_new_posts > 0) actParts.push(`IG ${d.instagram_new_posts}`);
  if (d.tiktok_new_videos > 0)   actParts.push(`TikTok ${d.tiktok_new_videos}`);
  if (d.youtube_new_videos > 0)  actParts.push(`YT ${d.youtube_new_videos}`);
  if (d.linkedin_new_posts > 0)  actParts.push(`LI ${d.linkedin_new_posts}`);
  if (d.facebook_new > 0)        actParts.push(`Meta ${d.facebook_new}`);
  if (d.google_new > 0)          actParts.push(`Google ${d.google_new}`);
  const actLine = actParts.length > 0 ? actParts.join("  ·  ") : "لا تغيير هذا الأسبوع";
  R.push(...txt(slideId, W * 0.45, IN * 0.12, W * 0.52, IN * 0.42,
    actLine,
    { size: 10, color: P.teal, align: "END" },
  ));

  // ── Left column: analysis (x = 0.25in, width = 5.1in) ──
  const lx = IN * 0.25;
  const lw = IN * 5.1;
  let ly = IN * 0.8;

  // Summary sentence
  if (ct?.summary) {
    R.push(...txt(slideId, lx, ly, lw, IN * 0.45,
      ct.summary,
      { italic: true, size: 11, color: P.textMid },
    ));
    ly += IN * 0.5;
  }

  // ✅ What they're doing right
  if ((ct?.good || []).length > 0) {
    R.push(...rect(id("gb"), slideId, lx, ly, lw, IN * 0.3, P.greenBg, P.greenBorder));
    R.push(...txt(slideId, lx + IN * 0.15, ly + IN * 0.04, lw - IN * 0.3, IN * 0.25,
      "يعملونه صح",
      { bold: true, size: 10, color: P.green },
    ));
    ly += IN * 0.34;
    for (const g of (ct.good || []).slice(0, 2)) {
      R.push(...txt(slideId, lx + IN * 0.1, ly, lw - IN * 0.2, IN * 0.38,
        `•  ${g}`,
        { size: 10, color: P.textDark },
      ));
      ly += IN * 0.38;
    }
    ly += IN * 0.08;
  }

  // ❌ Gaps
  if ((ct?.bad || []).length > 0) {
    R.push(...rect(id("rb"), slideId, lx, ly, lw, IN * 0.3, P.redBg, P.redBorder));
    R.push(...txt(slideId, lx + IN * 0.15, ly + IN * 0.04, lw - IN * 0.3, IN * 0.25,
      "ثغرات نقدر نستفيد منها",
      { bold: true, size: 10, color: P.red },
    ));
    ly += IN * 0.34;
    for (const b of (ct.bad || []).slice(0, 2)) {
      R.push(...txt(slideId, lx + IN * 0.1, ly, lw - IN * 0.2, IN * 0.38,
        `•  ${b}`,
        { size: 10, color: P.textDark },
      ));
      ly += IN * 0.38;
    }
    ly += IN * 0.08;
  }

  // Qoyod advantage
  if (ct?.qoyod_advantage) {
    const advH = IN * 0.62;
    R.push(...rect(id("adv"), slideId, lx, ly, lw, advH, P.tealBg, P.teal));
    R.push(...textBox(id("advt"), slideId, lx + IN * 0.15, ly + IN * 0.06, lw - IN * 0.3, advH - IN * 0.08,
      [
        { text: "ميزة قيود:  ", bold: true, size: 10, color: P.teal },
        { text: ct.qoyod_advantage, size: 10, color: P.navy },
      ],
    ));
  }

  // ── Right column: top social post ──
  const rx = IN * 5.55;
  const rw = W - rx - IN * 0.25;
  const samples = d.top_samples.slice(0, 2);

  if (samples.length === 0) {
    R.push(...txt(slideId, rx, IN * 1.5, rw, IN * 0.4,
      "لا منشورات جديدة هذا الأسبوع",
      { size: 10, color: P.gray, align: "CENTER" },
    ));
  }

  let ry = IN * 0.8;
  for (const s of samples) {
    const slotH = samples.length === 1 ? IN * 3.8 : IN * 1.85;

    // Card background
    R.push(...rect(id("pc"), slideId, rx, ry, rw, slotH, P.offWhite, P.grayLight));

    // Platform tag
    R.push(...rect(id("pt"), slideId, rx, ry, rw, IN * 0.3, P.navy));
    R.push(...txt(slideId, rx + IN * 0.1, ry + IN * 0.03, rw - IN * 0.2, IN * 0.26,
      s.source.toUpperCase(),
      { bold: true, size: 9, color: P.teal, align: "START" },
    ));

    let contentY = ry + IN * 0.35;

    // Image (if available)
    if (s.image_url) {
      const imgH = samples.length === 1 ? IN * 2.2 : IN * 1.0;
      try {
        R.push(img(slideId, s.image_url, rx + IN * 0.1, contentY, rw - IN * 0.2, imgH));
        contentY += imgH + IN * 0.1;
      } catch { /* skip expired URLs */ }
    }

    // Post text excerpt
    const postText = (s.hook || s.body || "").slice(0, 140);
    const textH = slotH - (contentY - ry) - IN * 0.42;
    if (postText && textH > IN * 0.2) {
      R.push(...txt(slideId, rx + IN * 0.12, contentY, rw - IN * 0.22, textH,
        `"${postText}"`,
        { italic: true, size: 9, color: P.textMid },
      ));
    }

    // View post link
    if (s.detail_url) {
      const linkY = ry + slotH - IN * 0.38;
      R.push(...txt(slideId, rx + IN * 0.1, linkY, rw - IN * 0.2, IN * 0.32,
        "عرض المنشور  ←",
        { bold: true, size: 9, color: P.teal, link: s.detail_url, align: "START" },
      ));
    }

    ry += slotH + IN * 0.12;
  }

  // Proven winners footer bar
  if (d.proven_winners.length > 0) {
    const pwY = H - IN * 0.52;
    R.push(...rect(id("pw"), slideId, 0, pwY, W, IN * 0.45, P.amberBg, P.amberBorder));
    R.push(...txt(slideId, IN * 0.25, pwY + IN * 0.07, W - IN * 0.5, IN * 0.3,
      `محتوى مثبت (>30 يوم):  ${d.proven_winners.slice(0, 2).join("  ·  ")}`,
      { size: 9, color: P.amber },
    ));
  }

  return R;
}

// ─── TASKS SLIDE ─────────────────────────────────────────────────────────────
function tasksSlide(slideId: string, tasks: Array<{ title: string; owner: string; deadline?: string; why?: string }>): any[] {
  const R: any[] = [
    { createSlide: { objectId: slideId, slideLayoutReference: { predefinedLayout: "BLANK" } } },
    bgReq(slideId, P.white),
  ];

  R.push(...rect(id("hdr"), slideId, 0, 0, W, IN * 0.6, P.navy));
  R.push(...rect(id("hac"), slideId, 0, 0, IN * 0.08, IN * 0.6, P.teal));
  R.push(...txt(slideId, IN * 0.25, IN * 0.1, W - IN * 0.5, IN * 0.45,
    "مهام الفريق هذا الأسبوع",
    { bold: true, size: 20, color: P.white },
  ));

  const rowH = IN * 0.72;
  const rowGap = IN * 0.1;

  for (let i = 0; i < Math.min(tasks.length, 6); i++) {
    const t = tasks[i];
    const ty = IN * 0.75 + i * (rowH + rowGap);
    const bg = i % 2 === 0 ? P.offWhite : P.white;

    R.push(...rect(id("tr"), slideId, IN * 0.25, ty, W - IN * 0.5, rowH, bg, P.grayLight));

    // Number badge
    R.push(...rect(id("nb"), slideId, IN * 0.25, ty, IN * 0.45, rowH, P.teal));
    R.push(...txt(slideId, IN * 0.25, ty + IN * 0.18, IN * 0.45, IN * 0.38,
      String(i + 1),
      { bold: true, size: 16, color: P.white, align: "CENTER" },
    ));

    // Task title
    R.push(...txt(slideId, IN * 0.82, ty + IN * 0.05, W - IN * 3.5, IN * 0.38,
      t.title,
      { bold: true, size: 12, color: P.navy },
    ));

    // Why (if available)
    if (t.why) {
      R.push(...txt(slideId, IN * 0.82, ty + IN * 0.4, W - IN * 3.5, IN * 0.28,
        t.why,
        { italic: true, size: 9, color: P.gray },
      ));
    }

    // Owner + deadline (right side)
    const meta = [t.owner, t.deadline].filter(Boolean).join("  ·  ");
    R.push(...txt(slideId, W - IN * 2.7, ty + IN * 0.2, IN * 2.3, IN * 0.35,
      meta,
      { size: 9, color: P.teal, align: "END" },
    ));
  }

  return R;
}

// ─── ALERT SLIDE ─────────────────────────────────────────────────────────────
function alertSlide(slideId: string, alert: string): any[] {
  const R: any[] = [
    { createSlide: { objectId: slideId, slideLayoutReference: { predefinedLayout: "BLANK" } } },
    bgReq(slideId, P.redBg),
  ];
  R.push(...rect(id("top"), slideId, 0, 0, W, IN * 0.12, P.red));
  R.push(...rect(id("bot"), slideId, 0, H - IN * 0.12, W, IN * 0.12, P.red));
  R.push(...txt(slideId, IN, H / 2 - IN * 0.85, W - IN * 2, IN * 0.55,
    "تنبيه عاجل",
    { bold: true, size: 26, color: P.red, align: "CENTER" },
  ));
  R.push(...txt(slideId, IN, H / 2 - IN * 0.2, W - IN * 2, IN * 1.2,
    alert,
    { size: 15, color: P.textDark, align: "CENTER" },
  ));
  return R;
}

// ─── MAIN EXPORT ─────────────────────────────────────────────────────────────
export interface AIOutput {
  headline?: string;
  competitors?: Array<{ name: string; summary: string; good?: string[]; bad?: string[]; qoyod_advantage?: string }>;
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

    // Create file via Drive (avoids presentations.create permission issues)
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

    // Get the auto-created default slide so we can delete it
    const presInfo = await slides.presentations.get({ presentationId: presId });
    const defaultSlide = presInfo.data.slides?.[0];

    // Build all requests
    const total = diffs.reduce((s, d) =>
      s + d.facebook_new + d.google_new + d.instagram_new_posts +
      d.youtube_new_videos + d.tiktok_new_videos + d.snapchat_new_posts + d.linkedin_new_posts, 0);

    const requests: any[] = [];

    // Delete default blank slide
    if (defaultSlide?.objectId) {
      requests.push({ deleteObject: { objectId: defaultSlide.objectId } });
    }

    // 1. Cover
    const coverSid = id("slide");
    requests.push(...coverSlide(coverSid, weekLabel, total, diffs.length));

    // 2. Summary
    const sumSid = id("slide");
    requests.push(...summarySlide(sumSid, ai, diffs, weekLabel));

    // 3. Per-competitor (only active ones)
    for (const d of diffs) {
      const act = d.facebook_new + d.google_new + d.instagram_new_posts +
                  d.youtube_new_videos + d.tiktok_new_videos + d.linkedin_new_posts;
      if (act === 0 && d.facebook_paused === 0) continue;
      const ct = (ai.competitors || []).find(c => c.name.toLowerCase() === d.competitor.toLowerCase());
      const sid = id("slide");
      requests.push(...competitorSlide(sid, d, ct));
    }

    // 4. Tasks
    if ((ai.tasks || []).length > 0) {
      const tSid = id("slide");
      requests.push(...tasksSlide(tSid, ai.tasks!));
    }

    // 5. Alert
    if (ai.alert) {
      const aSid = id("slide");
      requests.push(...alertSlide(aSid, ai.alert));
    }

    await slides.presentations.batchUpdate({
      presentationId: presId,
      requestBody: { requests },
    });

    const link = driveFile.data.webViewLink
      ?? `https://docs.google.com/presentation/d/${presId}/edit`;

    return { ok: true, link };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
