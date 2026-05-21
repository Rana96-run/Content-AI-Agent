/**
 * Competitor Weekly Social Listening Report — Google Slides renderer.
 *
 * Design language (from Qoyod brand deck):
 *   Primary dark  #162560  deep navy
 *   Mid blue      #1C4587  royal blue (headers, accents)
 *   Bright blue   #2F75F2  CTA / highlight color
 *   Card bg       #F4F5F7  light gray
 *   White         #FFFFFF
 *   Font          Lama Sans (Arabic + Latin)
 *   NO turquoise / teal anywhere
 */

import { google } from "googleapis";
import type { WeekDiff } from "./competitor-weekly-report.js";

// ─── Dimensions ──────────────────────────────────────────────────────────────
const W  = 9_144_000;   // 10 in
const H  = 5_143_500;   // 5.625 in
const IN = 914_400;     // 1 inch in EMU

// ─── Palette ─────────────────────────────────────────────────────────────────
const C = {
  navy:       "#162560",
  navyMid:    "#1C3A7A",   // slightly lighter navy for cards on dark bg
  royalBlue:  "#1C4587",
  brightBlue: "#2F75F2",
  cardBg:     "#F4F5F7",
  cardBorder: "#DDE3EE",
  white:      "#FFFFFF",
  textDark:   "#162560",
  textMid:    "#3A3A3A",
  textLight:  "#6B7280",
  green:      "#166534",
  greenBg:    "#DCFCE7",
  greenBdr:   "#86EFAC",
  red:        "#991B1B",
  redBg:      "#FEE2E2",
  redBdr:     "#FCA5A5",
  amber:      "#92400E",
  amberBg:    "#FEF3C7",
  amberBdr:   "#FCD34D",
};

// ─── Auth ─────────────────────────────────────────────────────────────────────
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

// ─── Low-level helpers ────────────────────────────────────────────────────────
function rgb(hex: string) {
  const h = hex.replace(/^#/, "");
  if (h.length !== 6) return { red: 0, green: 0, blue: 0 };
  return {
    red:   parseInt(h.slice(0, 2), 16) / 255,
    green: parseInt(h.slice(2, 4), 16) / 255,
    blue:  parseInt(h.slice(4, 6), 16) / 255,
  };
}
const pt = (n: number) => ({ magnitude: n, unit: "PT" as const });

let _seq = 0;
const eid = (p = "e") => `${p}_${++_seq}_${Date.now() % 1_000_000}`;

function emu(w: number, h: number) {
  return { width: { magnitude: w, unit: "EMU" as const }, height: { magnitude: h, unit: "EMU" as const } };
}
function pos(x: number, y: number) {
  return { scaleX: 1, scaleY: 1, translateX: x, translateY: y, unit: "EMU" as const };
}

// Slide background
function setBg(slideId: string, hex: string): any {
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

// Filled rectangle — borderColor optional
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

// Text block type
interface TB {
  text:   string;
  size?:  number;
  color?: string;
  bold?:  boolean;
  italic?: boolean;
  align?: "START" | "CENTER" | "END";
  link?:  string;
}

// Text box with Lama Sans font
function textBox(
  id: string, slideId: string,
  x: number, y: number, w: number, h: number,
  blocks: TB[],
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
        objectId: id,
        fields: "shapeBackgroundFill,outline",
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
          alignment: b.align || "END",
          direction: "RIGHT_TO_LEFT",
          spaceAbove: pt(0),
          spaceBelow: pt(2),
          lineSpacing: 125,
        },
      },
    });

    cursor += len + (i < blocks.length - 1 ? 1 : 0);
  }
  return R;
}

// Single-block text box shorthand
function txt(
  slideId: string,
  x: number, y: number, w: number, h: number,
  text: string, opts: Omit<TB, "text"> = {},
): any[] {
  return textBox(eid("t"), slideId, x, y, w, h, [{ text, ...opts }]);
}

// Image
function image(slideId: string, url: string, x: number, y: number, w: number, h: number): any {
  return {
    createImage: {
      objectId: eid("img"), url,
      elementProperties: { pageObjectId: slideId, size: emu(w, h), transform: pos(x, y) },
    },
  };
}

// New blank slide
function newSlide(slideId: string): any {
  return { createSlide: { objectId: slideId, slideLayoutReference: { predefinedLayout: "BLANK" } } };
}

// ─── COVER SLIDE ─────────────────────────────────────────────────────────────
// Layout: Full navy bg · large right-side decorative block · title left-aligned
function coverSlide(
  slideId: string, weekLabel: string, total: number, compCount: number,
): any[] {
  const R: any[] = [newSlide(slideId), setBg(slideId, C.navy)];

  // Right-side royal blue decorative panel (40% width, full height)
  R.push(...box(eid("rpanel"), slideId, W * 0.62, 0, W * 0.38, H, C.royalBlue));

  // Bright blue accent strip at bottom of right panel
  R.push(...box(eid("bstrip"), slideId, W * 0.62, H - IN * 0.28, W * 0.38, IN * 0.28, C.brightBlue));

  // Diagonal divider — a rotated rectangle to create a slant effect
  // Simulate with a narrow bright-blue strip at the boundary
  R.push(...box(eid("divider"), slideId, W * 0.60, 0, IN * 0.18, H, C.brightBlue));

  // Left content area
  // Week label (small, above title)
  R.push(...txt(slideId, IN * 0.5, IN * 1.1, IN * 5.5, IN * 0.42,
    weekLabel,
    { size: 14, color: C.brightBlue, align: "START" },
  ));

  // Main title
  R.push(...txt(slideId, IN * 0.5, IN * 1.6, IN * 5.5, IN * 1.5,
    "رصد المنافسين\nالأسبوعي",
    { bold: true, size: 42, color: C.white, align: "START" },
  ));

  // Horizontal rule
  R.push(...box(eid("hr"), slideId, IN * 0.5, IN * 3.3, IN * 3.5, IN * 0.04, C.brightBlue));

  // Subtitle
  R.push(...txt(slideId, IN * 0.5, IN * 3.45, IN * 5.5, IN * 0.38,
    "تقرير رصد وسائل التواصل الاجتماعي للمنافسين",
    { size: 12, color: "#B0BDDE", align: "START" },
  ));

  // Stat boxes (bottom left)
  const bx = IN * 0.5;
  const by = H - IN * 1.25;
  const bw = IN * 2.0;
  const bh = IN * 0.92;
  const gap = IN * 0.22;

  // Box 1 — total activity
  R.push(...box(eid("b1"), slideId, bx, by, bw, bh, C.navyMid, C.brightBlue));
  R.push(...txt(slideId, bx, by + IN * 0.06, bw, IN * 0.5,
    String(total),
    { bold: true, size: 28, color: C.white, align: "CENTER" },
  ));
  R.push(...txt(slideId, bx, by + IN * 0.54, bw, IN * 0.3,
    "نشاط رُصد",
    { size: 9, color: "#B0BDDE", align: "CENTER" },
  ));

  // Box 2 — competitors
  R.push(...box(eid("b2"), slideId, bx + bw + gap, by, bw, bh, C.navyMid, C.brightBlue));
  R.push(...txt(slideId, bx + bw + gap, by + IN * 0.06, bw, IN * 0.5,
    String(compCount),
    { bold: true, size: 28, color: C.white, align: "CENTER" },
  ));
  R.push(...txt(slideId, bx + bw + gap, by + IN * 0.54, bw, IN * 0.3,
    "منافس",
    { size: 9, color: "#B0BDDE", align: "CENTER" },
  ));

  // Brand name bottom right (on the blue panel)
  R.push(...txt(slideId, W * 0.65, H - IN * 0.55, W * 0.32, IN * 0.38,
    "Somaa · قيود",
    { size: 10, color: C.white, align: "CENTER" },
  ));

  return R;
}

// ─── SUMMARY SLIDE ───────────────────────────────────────────────────────────
function summarySlide(slideId: string, ai: any, diffs: WeekDiff[], weekLabel: string): any[] {
  const R: any[] = [newSlide(slideId), setBg(slideId, C.white)];

  // Navy header
  R.push(...box(eid("hdr"), slideId, 0, 0, W, IN * 0.62, C.navy));
  R.push(...box(eid("hac"), slideId, 0, 0, IN * 0.1, IN * 0.62, C.brightBlue));
  R.push(...txt(slideId, IN * 0.25, IN * 0.1, W - IN * 0.5, IN * 0.46,
    `ملخّص الأسبوع  ·  ${weekLabel}`,
    { bold: true, size: 17, color: C.white },
  ));

  // AI Headline
  R.push(...box(eid("hl"), slideId, IN * 0.35, IN * 0.78, W - IN * 0.7, IN * 0.65, C.cardBg, C.brightBlue, 2));
  R.push(...txt(slideId, IN * 0.55, IN * 0.85, W - IN * 1.1, IN * 0.52,
    ai.headline || "اتجاه الأسبوع",
    { bold: true, size: 16, color: C.navy },
  ));

  // Competitor activity cards
  const cols = diffs.length;
  const cw = (W - IN * 0.7 - IN * 0.15 * (cols - 1)) / cols;
  const cy = IN * 1.62;
  const ch = IN * 1.9;

  for (let i = 0; i < cols; i++) {
    const d = diffs[i];
    const total = d.facebook_new + d.google_new + d.instagram_new_posts +
                  d.youtube_new_videos + d.tiktok_new_videos + d.linkedin_new_posts;
    const cx = IN * 0.35 + i * (cw + IN * 0.15);

    R.push(...box(eid("cc"), slideId, cx, cy, cw, ch,
      total > 0 ? C.cardBg : C.white,
      total > 0 ? C.brightBlue : C.cardBorder,
    ));

    // Top color strip
    R.push(...box(eid("ctop"), slideId, cx, cy, cw, IN * 0.28,
      total > 0 ? C.royalBlue : C.cardBorder,
    ));

    // Competitor name
    R.push(...txt(slideId, cx + IN * 0.1, cy + IN * 0.03, cw - IN * 0.2, IN * 0.28,
      d.competitor,
      { bold: true, size: 11, color: C.white, align: "CENTER" },
    ));

    // Total number
    R.push(...txt(slideId, cx, cy + IN * 0.32, cw, IN * 0.55,
      String(total),
      { bold: true, size: 26, color: total > 0 ? C.navy : C.textLight, align: "CENTER" },
    ));
    R.push(...txt(slideId, cx, cy + IN * 0.84, cw, IN * 0.22,
      "نشاط جديد",
      { size: 9, color: C.textLight, align: "CENTER" },
    ));

    // Platform breakdown
    const lines: string[] = [];
    if (d.instagram_new_posts > 0)  lines.push(`IG  ${d.instagram_new_posts}`);
    if (d.tiktok_new_videos > 0)    lines.push(`TikTok  ${d.tiktok_new_videos}`);
    if (d.youtube_new_videos > 0)   lines.push(`YouTube  ${d.youtube_new_videos}`);
    if (d.linkedin_new_posts > 0)   lines.push(`LinkedIn  ${d.linkedin_new_posts}`);
    if (d.facebook_new > 0)         lines.push(`Meta  ${d.facebook_new}`);
    if (d.google_new > 0)           lines.push(`Google  ${d.google_new}`);
    if (lines.length === 0)         lines.push("لا تغيير");

    R.push(...txt(slideId, cx + IN * 0.1, cy + IN * 1.1, cw - IN * 0.2, ch - IN * 1.2,
      lines.join("\n"),
      { size: 9, color: C.textMid, align: "CENTER" },
    ));
  }

  // Notable angles
  const angles = diffs.flatMap(d => d.notable_angles).filter(Boolean).slice(0, 4);
  if (angles.length > 0) {
    const ay = IN * 3.72;
    R.push(...txt(slideId, IN * 0.35, ay, W - IN * 0.7, IN * 0.3,
      "أبرز الزوايا والرسائل:",
      { bold: true, size: 10, color: C.textMid },
    ));
    const aw = (W - IN * 0.85) / 2;
    for (let i = 0; i < Math.min(angles.length, 4); i++) {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const ax = IN * 0.35 + col * (aw + IN * 0.15);
      const aY = ay + IN * 0.35 + row * IN * 0.5;
      R.push(...box(eid("ang"), slideId, ax, aY, aw, IN * 0.42, C.cardBg, C.cardBorder));
      R.push(...txt(slideId, ax + IN * 0.15, aY + IN * 0.06, aw - IN * 0.3, IN * 0.32,
        `"${angles[i]}"`,
        { italic: true, size: 10, color: C.textMid },
      ));
    }
  }

  return R;
}

// ─── COMPETITOR SLIDE ─────────────────────────────────────────────────────────
function competitorSlide(slideId: string, d: WeekDiff, ct: any): any[] {
  const R: any[] = [newSlide(slideId), setBg(slideId, C.white)];

  // Navy header
  R.push(...box(eid("hdr"), slideId, 0, 0, W, IN * 0.65, C.navy));
  R.push(...box(eid("hac"), slideId, 0, 0, IN * 0.1, IN * 0.65, C.brightBlue));
  R.push(...txt(slideId, IN * 0.25, IN * 0.1, W * 0.55, IN * 0.48,
    d.competitor,
    { bold: true, size: 22, color: C.white },
  ));

  // Activity summary in header
  const parts: string[] = [];
  if (d.instagram_new_posts > 0)  parts.push(`IG ${d.instagram_new_posts}`);
  if (d.tiktok_new_videos > 0)    parts.push(`TikTok ${d.tiktok_new_videos}`);
  if (d.youtube_new_videos > 0)   parts.push(`YT ${d.youtube_new_videos}`);
  if (d.linkedin_new_posts > 0)   parts.push(`LI ${d.linkedin_new_posts}`);
  if (d.facebook_new > 0)         parts.push(`Meta ${d.facebook_new}`);
  if (d.google_new > 0)           parts.push(`Google ${d.google_new}`);

  R.push(...txt(slideId, W * 0.44, IN * 0.14, W * 0.53, IN * 0.38,
    parts.length > 0 ? parts.join("  ·  ") : "لا تغيير",
    { size: 10, color: "#B0BDDE", align: "END" },
  ));

  // ── Left column: analysis ── (0.25in → 5.2in)
  const lx = IN * 0.25;
  const lw = IN * 5.0;
  let ly = IN * 0.82;

  // Summary
  if (ct?.summary) {
    R.push(...txt(slideId, lx, ly, lw, IN * 0.42,
      ct.summary,
      { italic: true, size: 11, color: C.textMid },
    ));
    ly += IN * 0.48;
  }

  // ✅ Good
  const good = (ct?.good || []).slice(0, 2);
  if (good.length > 0) {
    R.push(...box(eid("glbl"), slideId, lx, ly, lw, IN * 0.3, C.greenBg, C.greenBdr));
    R.push(...txt(slideId, lx + IN * 0.15, ly + IN * 0.03, lw - IN * 0.3, IN * 0.26,
      "يعملونه صح", { bold: true, size: 10, color: C.green },
    ));
    ly += IN * 0.34;
    for (const g of good) {
      R.push(...txt(slideId, lx + IN * 0.12, ly, lw - IN * 0.2, IN * 0.36,
        `•  ${g}`, { size: 10, color: C.textDark },
      ));
      ly += IN * 0.37;
    }
    ly += IN * 0.06;
  }

  // ❌ Gaps
  const bad = (ct?.bad || []).slice(0, 2);
  if (bad.length > 0) {
    R.push(...box(eid("rlbl"), slideId, lx, ly, lw, IN * 0.3, C.redBg, C.redBdr));
    R.push(...txt(slideId, lx + IN * 0.15, ly + IN * 0.03, lw - IN * 0.3, IN * 0.26,
      "ثغرات نقدر نستفيد منها", { bold: true, size: 10, color: C.red },
    ));
    ly += IN * 0.34;
    for (const b of bad) {
      R.push(...txt(slideId, lx + IN * 0.12, ly, lw - IN * 0.2, IN * 0.36,
        `•  ${b}`, { size: 10, color: C.textDark },
      ));
      ly += IN * 0.37;
    }
    ly += IN * 0.06;
  }

  // Qoyod advantage
  if (ct?.qoyod_advantage) {
    const advH = IN * 0.65;
    R.push(...box(eid("adv"), slideId, lx, ly, lw, advH, C.cardBg, C.brightBlue, 2));
    R.push(...textBox(eid("advt"), slideId, lx + IN * 0.15, ly + IN * 0.08, lw - IN * 0.3, advH - IN * 0.1,
      [
        { text: "ميزة قيود:  ", bold: true, size: 10, color: C.royalBlue },
        { text: ct.qoyod_advantage, size: 10, color: C.textDark },
      ],
    ));
  }

  // ── Right column: top post ──
  const rx = IN * 5.45;
  const rw = W - rx - IN * 0.25;
  const samples = d.top_samples.slice(0, 2);
  let ry = IN * 0.82;

  if (samples.length === 0) {
    R.push(...box(eid("nop"), slideId, rx, ry, rw, IN * 0.5, C.cardBg, C.cardBorder));
    R.push(...txt(slideId, rx + IN * 0.1, ry + IN * 0.12, rw - IN * 0.2, IN * 0.28,
      "لا منشورات جديدة هذا الأسبوع",
      { size: 10, color: C.textLight, align: "CENTER" },
    ));
    ry += IN * 0.6;
  }

  for (const s of samples) {
    const slotH = samples.length === 1 ? IN * 3.85 : IN * 1.88;

    R.push(...box(eid("pc"), slideId, rx, ry, rw, slotH, C.cardBg, C.cardBorder));
    // Platform header
    R.push(...box(eid("pt"), slideId, rx, ry, rw, IN * 0.3, C.royalBlue));
    R.push(...txt(slideId, rx + IN * 0.1, ry + IN * 0.04, rw - IN * 0.2, IN * 0.24,
      s.source.toUpperCase(),
      { bold: true, size: 9, color: C.white, align: "START" },
    ));

    let cy2 = ry + IN * 0.35;

    // Image
    if (s.image_url) {
      const imgH = samples.length === 1 ? IN * 2.2 : IN * 1.0;
      try {
        R.push(image(slideId, s.image_url, rx + IN * 0.1, cy2, rw - IN * 0.2, imgH));
        cy2 += imgH + IN * 0.1;
      } catch { /* skip */ }
    }

    // Post text
    const postText = (s.hook || s.body || "").slice(0, 150);
    const textH = slotH - (cy2 - ry) - IN * 0.42;
    if (postText && textH > IN * 0.2) {
      R.push(...txt(slideId, rx + IN * 0.12, cy2, rw - IN * 0.22, textH,
        `"${postText}"`,
        { italic: true, size: 9, color: C.textMid },
      ));
    }

    // Link
    if (s.detail_url) {
      R.push(...txt(slideId, rx + IN * 0.1, ry + slotH - IN * 0.36, rw - IN * 0.2, IN * 0.3,
        "عرض المنشور  ←",
        { bold: true, size: 9, color: C.brightBlue, link: s.detail_url, align: "START" },
      ));
    }

    ry += slotH + IN * 0.1;
  }

  // Proven winners footer
  if (d.proven_winners.length > 0) {
    const pwY = H - IN * 0.5;
    R.push(...box(eid("pw"), slideId, 0, pwY, W, IN * 0.45, C.amberBg, C.amberBdr));
    R.push(...txt(slideId, IN * 0.25, pwY + IN * 0.07, W - IN * 0.5, IN * 0.3,
      `محتوى مثبت (>30 يوم):  ${d.proven_winners.slice(0, 2).join("  ·  ")}`,
      { size: 9, color: C.amber },
    ));
  }

  return R;
}

// ─── TASKS SLIDE ─────────────────────────────────────────────────────────────
function tasksSlide(slideId: string, tasks: Array<{ title: string; owner: string; deadline?: string; why?: string }>): any[] {
  const R: any[] = [newSlide(slideId), setBg(slideId, C.white)];

  R.push(...box(eid("hdr"), slideId, 0, 0, W, IN * 0.62, C.navy));
  R.push(...box(eid("hac"), slideId, 0, 0, IN * 0.1, IN * 0.62, C.brightBlue));
  R.push(...txt(slideId, IN * 0.25, IN * 0.1, W - IN * 0.5, IN * 0.46,
    "مهام الفريق هذا الأسبوع",
    { bold: true, size: 20, color: C.white },
  ));

  const rh  = IN * 0.72;
  const gap = IN * 0.1;

  for (let i = 0; i < Math.min(tasks.length, 6); i++) {
    const t = tasks[i];
    const ty = IN * 0.78 + i * (rh + gap);
    R.push(...box(eid("tr"), slideId, IN * 0.25, ty, W - IN * 0.5, rh,
      i % 2 === 0 ? C.cardBg : C.white, C.cardBorder,
    ));
    // Number badge
    R.push(...box(eid("nb"), slideId, IN * 0.25, ty, IN * 0.48, rh, C.royalBlue));
    R.push(...txt(slideId, IN * 0.25, ty + IN * 0.18, IN * 0.48, IN * 0.38,
      String(i + 1),
      { bold: true, size: 18, color: C.white, align: "CENTER" },
    ));
    // Title
    R.push(...txt(slideId, IN * 0.85, ty + IN * 0.05, W - IN * 3.6, IN * 0.38,
      t.title,
      { bold: true, size: 12, color: C.navy },
    ));
    if (t.why) {
      R.push(...txt(slideId, IN * 0.85, ty + IN * 0.4, W - IN * 3.6, IN * 0.28,
        t.why,
        { italic: true, size: 9, color: C.textLight },
      ));
    }
    // Owner · deadline
    R.push(...txt(slideId, W - IN * 2.8, ty + IN * 0.2, IN * 2.35, IN * 0.35,
      [t.owner, t.deadline].filter(Boolean).join("  ·  "),
      { size: 9, color: C.brightBlue, align: "END" },
    ));
  }

  return R;
}

// ─── ALERT SLIDE ─────────────────────────────────────────────────────────────
function alertSlide(slideId: string, alert: string): any[] {
  const R: any[] = [newSlide(slideId), setBg(slideId, C.redBg)];
  R.push(...box(eid("top"), slideId, 0, 0, W, IN * 0.14, C.red));
  R.push(...box(eid("bot"), slideId, 0, H - IN * 0.14, W, IN * 0.14, C.red));
  R.push(...txt(slideId, IN, H / 2 - IN * 0.9, W - IN * 2, IN * 0.55,
    "تنبيه عاجل",
    { bold: true, size: 26, color: C.red, align: "CENTER" },
  ));
  R.push(...txt(slideId, IN, H / 2 - IN * 0.25, W - IN * 2, IN * 1.2,
    alert,
    { size: 15, color: C.textDark, align: "CENTER" },
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

    // Cover
    requests.push(...coverSlide(eid("slide"), weekLabel, total, diffs.length));

    // Summary
    requests.push(...summarySlide(eid("slide"), ai, diffs, weekLabel));

    // Per-competitor
    for (const d of diffs) {
      const act = d.facebook_new + d.google_new + d.instagram_new_posts +
                  d.youtube_new_videos + d.tiktok_new_videos + d.linkedin_new_posts;
      if (act === 0 && d.facebook_paused === 0) continue;
      const ct = (ai.competitors || []).find(c => c.name.toLowerCase() === d.competitor.toLowerCase());
      requests.push(...competitorSlide(eid("slide"), d, ct));
    }

    // Tasks
    if ((ai.tasks || []).length > 0) {
      requests.push(...tasksSlide(eid("slide"), ai.tasks!));
    }

    // Alert
    if (ai.alert) {
      requests.push(...alertSlide(eid("slide"), ai.alert));
    }

    await slides.presentations.batchUpdate({ presentationId: presId, requestBody: { requests } });

    return {
      ok: true,
      link: driveFile.data.webViewLink ?? `https://docs.google.com/presentation/d/${presId}/edit`,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
