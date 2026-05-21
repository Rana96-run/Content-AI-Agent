/**
 * Competitor Weekly Social Listening Report — Google Slides renderer.
 *
 * Builds a branded presentation via the Google Slides API:
 *   Slide 1  — Cover (dark brand background)
 *   Slide 2  — Executive Summary (AI headline + platform activity overview)
 *   Slide 3+ — Per-competitor (one slide each, only for active competitors)
 *              Platform counts · Top post image + link · What they're doing
 *              right · Gaps · Qoyod advantage
 *   Last-1   — Action items for the team this week
 *   Last     — Alert slide (only when AI flags an urgent signal)
 *
 * The presentation is moved into GOOGLE_DRIVE_FOLDER_ID after creation.
 */

import { google } from "googleapis";
import type { WeekDiff } from "./competitor-weekly-report.js";

// ─── Constants ─────────────────────────────────────────────────────────────
const W = 9_144_000;   // slide width  (10 in)
const H = 5_143_500;   // slide height (5.625 in)
const EMU = 914_400;   // 1 inch in EMU

const C = {
  navy:    "#021544",
  teal:    "#17a3a3",
  tealBg:  "#e8f7f7",
  red:     "#dc2626",
  redBg:   "#fef2f2",
  white:   "#ffffff",
  gray:    "#6a96aa",
  lightGray: "#f5f8fa",
  textDark: "#1a2e42",
  textMid:  "#3d5a70",
  green:    "#16a34a",
  greenBg:  "#f0fdf4",
  amber:    "#d97706",
  amberBg:  "#fffbeb",
};

// ─── Auth helper ────────────────────────────────────────────────────────────
function getSlidesClient() {
  const scopes = [
    "https://www.googleapis.com/auth/presentations",
    "https://www.googleapis.com/auth/drive",
  ];

  const b64 = process.env.GOOGLE_SERVICE_ACCOUNT_B64;
  let credentials: object | undefined;
  if (b64) {
    try { credentials = JSON.parse(Buffer.from(b64, "base64").toString("utf8")); } catch { /* */ }
  }
  if (!credentials) {
    const inline = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    if (inline) {
      try { credentials = JSON.parse(inline.trim().replace(/\\n/g, "\n")); } catch { /* */ }
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

// ─── Low-level request builders ─────────────────────────────────────────────
function rgb(hex: string) {
  const h = hex.replace("#", "");
  return {
    red:   parseInt(h.slice(0, 2), 16) / 255,
    green: parseInt(h.slice(2, 4), 16) / 255,
    blue:  parseInt(h.slice(4, 6), 16) / 255,
  };
}

function pt(n: number) { return { magnitude: n, unit: "PT" as const }; }

let _idCounter = 0;
function uid(prefix = "el") { return `${prefix}_${++_idCounter}_${Date.now()}`; }

/** Create a slide and return its objectId */
function reqCreateSlide(slideId: string, layoutRef = "BLANK"): any {
  return {
    createSlide: {
      objectId: slideId,
      slideLayoutReference: { predefinedLayout: layoutRef },
      placeholderIdMappings: [],
    },
  };
}

/** Fill slide background with a solid color */
function reqSlideBackground(slideId: string, hex: string): any {
  return {
    updatePageProperties: {
      objectId: slideId,
      fields: "pageBackgroundFill",
      pageProperties: {
        pageBackgroundFill: {
          solidFill: { color: { rgbColor: rgb(hex) } },
        },
      },
    },
  };
}

/** Create a filled rectangle (no text) */
function reqRect(id: string, slideId: string, x: number, y: number, w: number, h: number, fillHex: string, borderHex?: string): any[] {
  const reqs: any[] = [
    {
      createShape: {
        objectId: id,
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
        objectId: id,
        fields: "shapeBackgroundFill,outline",
        shapeProperties: {
          shapeBackgroundFill: { solidFill: { color: { rgbColor: rgb(fillHex) } } },
          outline: borderHex
            ? { outlineFill: { solidFill: { color: { rgbColor: rgb(borderHex) } } }, weight: pt(1) }
            : { outlineFill: { solidFill: { color: { rgbColor: rgb(fillHex) } } } },
        },
      },
    },
  ];
  return reqs;
}

interface TextBlock {
  text: string;
  bold?: boolean;
  italic?: boolean;
  fontSize?: number;
  colorHex?: string;
  rtl?: boolean;
  align?: "START" | "CENTER" | "END";
  linkUrl?: string;
}

/** Create a text box with a single styled paragraph */
function reqTextBox(
  id: string,
  slideId: string,
  x: number, y: number, w: number, h: number,
  blocks: TextBlock[],
  bgHex?: string,
): any[] {
  const reqs: any[] = [
    {
      createShape: {
        objectId: id,
        shapeType: "TEXT_BOX",
        elementProperties: {
          pageObjectId: slideId,
          size: { width: { magnitude: w, unit: "EMU" }, height: { magnitude: h, unit: "EMU" } },
          transform: { scaleX: 1, scaleY: 1, translateX: x, translateY: y, unit: "EMU" },
        },
      },
    },
  ];

  if (bgHex) {
    reqs.push({
      updateShapeProperties: {
        objectId: id,
        fields: "shapeBackgroundFill",
        shapeProperties: {
          shapeBackgroundFill: { solidFill: { color: { rgbColor: rgb(bgHex) } } },
        },
      },
    });
  }

  // Build the full text string with newlines between blocks
  const fullText = blocks.map(b => b.text).join("\n");
  reqs.push({ insertText: { objectId: id, text: fullText, insertionIndex: 0 } });

  // Style each block
  let cursor = 0;
  for (const b of blocks) {
    const len = b.text.length;

    // Text style
    const textStyleFields: string[] = ["foregroundColor", "fontSize", "bold", "italic"];
    if (b.linkUrl) textStyleFields.push("link");
    reqs.push({
      updateTextStyle: {
        objectId: id,
        textRange: { type: "FIXED_RANGE", startIndex: cursor, endIndex: cursor + len },
        fields: textStyleFields.join(","),
        style: {
          foregroundColor: { opaqueColor: { rgbColor: rgb(b.colorHex || C.textDark) } },
          fontSize: pt(b.fontSize || 12),
          bold: b.bold ?? false,
          italic: b.italic ?? false,
          ...(b.linkUrl ? { link: { url: b.linkUrl } } : {}),
        },
      },
    });

    // Paragraph style (alignment + RTL)
    reqs.push({
      updateParagraphStyle: {
        objectId: id,
        textRange: { type: "FIXED_RANGE", startIndex: cursor, endIndex: cursor + len },
        fields: "alignment,direction,spaceAbove,spaceBelow",
        style: {
          alignment: b.align || (b.rtl !== false ? "END" : "START"),
          direction: "RIGHT_TO_LEFT",
          spaceAbove: pt(2),
          spaceBelow: pt(2),
        },
      },
    });

    cursor += len + 1; // +1 for the \n separator (except last block, no separator)
  }

  return reqs;
}

/** Insert an image from URL */
function reqImage(id: string, slideId: string, url: string, x: number, y: number, w: number, h: number): any {
  return {
    createImage: {
      objectId: id,
      url,
      elementProperties: {
        pageObjectId: slideId,
        size: { width: { magnitude: w, unit: "EMU" }, height: { magnitude: h, unit: "EMU" } },
        transform: { scaleX: 1, scaleY: 1, translateX: x, translateY: y, unit: "EMU" },
      },
    },
  };
}

// ─── Slide builders ─────────────────────────────────────────────────────────

function buildCoverSlide(slideId: string, weekLabel: string, totalActivity: number, competitorCount: number): any[] {
  const reqs: any[] = [
    reqCreateSlide(slideId),
    reqSlideBackground(slideId, C.navy),
  ];

  // Teal accent bar at top (full width, 6px)
  const topBar = uid("topbar");
  reqs.push(...reqRect(topBar, slideId, 0, 0, W, EMU * 0.06, C.teal));

  // Teal accent bar at bottom (full width, 6px)
  const botBar = uid("botbar");
  reqs.push(...reqRect(botBar, slideId, 0, H - EMU * 0.35, W, EMU * 0.06, C.teal));

  // Main title
  const titleId = uid("title");
  reqs.push(...reqTextBox(titleId, slideId,
    EMU, EMU * 1.5, W - EMU * 2, EMU * 1.2,
    [{ text: "رصد المنافسين الأسبوعي", bold: true, fontSize: 40, colorHex: C.white, align: "CENTER" }],
  ));

  // Subtitle — week label
  const subId = uid("sub");
  reqs.push(...reqTextBox(subId, slideId,
    EMU, EMU * 2.8, W - EMU * 2, EMU * 0.6,
    [{ text: weekLabel, fontSize: 20, colorHex: C.teal, align: "CENTER" }],
  ));

  // Stats row — two solid panels (Slides API only supports solid fills, no rgba)
  const statW = EMU * 3;
  const statH = EMU * 1.0;
  const statY = EMU * 3.7;
  const statBg = "#0d2d5e"; // slightly lighter navy — visible on dark bg

  const stat1bg = uid("stat1bg");
  reqs.push(...reqRect(stat1bg, slideId, W / 2 - statW - EMU * 0.3, statY, statW, statH, statBg, C.teal));
  // Number (large, teal)
  reqs.push(...reqTextBox(uid("s1num"), slideId,
    W / 2 - statW - EMU * 0.3, statY + EMU * 0.05, statW, EMU * 0.6,
    [{ text: String(totalActivity), bold: true, fontSize: 28, colorHex: C.teal, align: "CENTER" }],
  ));
  // Label (small, light gray)
  reqs.push(...reqTextBox(uid("s1lbl"), slideId,
    W / 2 - statW - EMU * 0.3, statY + EMU * 0.62, statW, EMU * 0.32,
    [{ text: "نشاط رُصد هذا الأسبوع", fontSize: 10, colorHex: C.gray, align: "CENTER" }],
  ));

  const stat2bg = uid("stat2bg");
  reqs.push(...reqRect(stat2bg, slideId, W / 2 + EMU * 0.3, statY, statW, statH, statBg, C.teal));
  reqs.push(...reqTextBox(uid("s2num"), slideId,
    W / 2 + EMU * 0.3, statY + EMU * 0.05, statW, EMU * 0.6,
    [{ text: String(competitorCount), bold: true, fontSize: 28, colorHex: C.teal, align: "CENTER" }],
  ));
  reqs.push(...reqTextBox(uid("s2lbl"), slideId,
    W / 2 + EMU * 0.3, statY + EMU * 0.62, statW, EMU * 0.32,
    [{ text: "منافس تحت المراقبة", fontSize: 10, colorHex: C.gray, align: "CENTER" }],
  ));

  // Footer brand
  const footId = uid("foot");
  reqs.push(...reqTextBox(footId, slideId,
    0, H - EMU * 0.55, W, EMU * 0.4,
    [{ text: "Somaa — وكيل المحتوى الذكي لقيود", fontSize: 9, colorHex: C.gray, align: "CENTER" }],
  ));

  return reqs;
}

function buildSummarySlide(slideId: string, ai: any, diffs: WeekDiff[], weekLabel: string): any[] {
  const reqs: any[] = [
    reqCreateSlide(slideId),
    reqSlideBackground(slideId, C.white),
  ];

  // Teal header strip
  const hdr = uid("hdr");
  reqs.push(...reqRect(hdr, slideId, 0, 0, W, EMU * 0.55, C.teal));
  const hdrTxt = uid("hdrtxt");
  reqs.push(...reqTextBox(hdrTxt, slideId, EMU * 0.3, 0, W - EMU * 0.6, EMU * 0.55,
    [{ text: `ملخّص الأسبوع · ${weekLabel}`, bold: true, fontSize: 14, colorHex: C.white }],
  ));

  // AI headline
  const headline = ai.headline || "اتجاه الأسبوع";
  const hlId = uid("hl");
  reqs.push(...reqRect(hlId, slideId, EMU * 0.5, EMU * 0.7, W - EMU, EMU * 0.7, C.tealBg));
  reqs.push(...reqTextBox(uid("hlt"), slideId,
    EMU * 0.7, EMU * 0.7, W - EMU * 1.4, EMU * 0.7,
    [{ text: headline, bold: true, fontSize: 18, colorHex: C.navy }],
  ));

  // Per-competitor activity pills row
  const pillY = EMU * 1.6;
  const pillW = (W - EMU) / Math.max(diffs.length, 1);
  for (let i = 0; i < diffs.length; i++) {
    const d = diffs[i];
    const total = d.facebook_new + d.google_new + d.instagram_new_posts +
                  d.youtube_new_videos + d.tiktok_new_videos + d.snapchat_new_posts + d.linkedin_new_posts;
    const pillX = EMU * 0.5 + i * pillW;
    const pillId = uid("pill");
    reqs.push(...reqRect(pillId, slideId, pillX + EMU * 0.1, pillY, pillW - EMU * 0.2, EMU * 0.75,
      total > 0 ? C.tealBg : C.lightGray, total > 0 ? C.teal : C.gray));

    const lines = [d.competitor];
    if (d.instagram_new_posts > 0) lines.push(`IG: ${d.instagram_new_posts}`);
    if (d.tiktok_new_videos > 0) lines.push(`TikTok: ${d.tiktok_new_videos}`);
    if (d.youtube_new_videos > 0) lines.push(`YT: ${d.youtube_new_videos}`);
    if (d.linkedin_new_posts > 0) lines.push(`LI: ${d.linkedin_new_posts}`);
    if (d.facebook_new > 0) lines.push(`Meta Ads: ${d.facebook_new}`);
    if (d.google_new > 0) lines.push(`Google: ${d.google_new}`);

    reqs.push(...reqTextBox(uid("pillt"), slideId,
      pillX + EMU * 0.15, pillY, pillW - EMU * 0.3, EMU * 0.75,
      [
        { text: d.competitor, bold: true, fontSize: 11, colorHex: total > 0 ? C.navy : C.gray, align: "CENTER" },
        { text: "\n" + lines.slice(1).join(" · "), fontSize: 9, colorHex: C.teal, align: "CENTER" },
      ],
    ));
  }

  // Notable angles across all competitors
  const allAngles = diffs.flatMap(d => d.notable_angles).filter(Boolean).slice(0, 5);
  if (allAngles.length > 0) {
    const angY = EMU * 2.55;
    const angLbl = uid("anglbl");
    reqs.push(...reqTextBox(angLbl, slideId,
      EMU * 0.5, angY, W - EMU, EMU * 0.35,
      [{ text: "أبرز الزوايا والرسائل التي رصدناها هذا الأسبوع:", bold: true, fontSize: 11, colorHex: C.navy }],
    ));

    for (let i = 0; i < allAngles.length; i++) {
      const angleId = uid("angle");
      const col = i % 2;
      const row = Math.floor(i / 2);
      const aW = (W - EMU * 1.2) / 2;
      const aX = EMU * 0.5 + col * (aW + EMU * 0.2);
      const aY = angY + EMU * 0.45 + row * EMU * 0.55;
      reqs.push(...reqRect(angleId, slideId, aX, aY, aW, EMU * 0.45, C.lightGray));
      reqs.push(...reqTextBox(uid("at"), slideId, aX + EMU * 0.15, aY, aW - EMU * 0.2, EMU * 0.45,
        [{ text: `"${allAngles[i]}"`, italic: true, fontSize: 10, colorHex: C.textMid }],
      ));
    }
  }

  return reqs;
}

function buildCompetitorSlide(slideId: string, d: WeekDiff, ct: any): any[] {
  const reqs: any[] = [
    reqCreateSlide(slideId),
    reqSlideBackground(slideId, C.white),
  ];

  // ── Header strip ──
  const hdr = uid("hdr");
  reqs.push(...reqRect(hdr, slideId, 0, 0, W, EMU * 0.6, C.navy));
  const hdrTxt = uid("hdrtxt");
  reqs.push(...reqTextBox(hdrTxt, slideId, EMU * 0.3, 0, W * 0.6, EMU * 0.6,
    [{ text: d.competitor, bold: true, fontSize: 22, colorHex: C.white }],
  ));

  // Activity summary in header (right side)
  const actParts: string[] = [];
  if (d.instagram_new_posts > 0) actParts.push(`IG ${d.instagram_new_posts}`);
  if (d.tiktok_new_videos > 0) actParts.push(`TikTok ${d.tiktok_new_videos}`);
  if (d.youtube_new_videos > 0) actParts.push(`YT ${d.youtube_new_videos}`);
  if (d.linkedin_new_posts > 0) actParts.push(`LI ${d.linkedin_new_posts}`);
  if (d.facebook_new > 0) actParts.push(`Meta ${d.facebook_new}`);
  if (d.google_new > 0) actParts.push(`Google ${d.google_new}`);
  if (d.facebook_paused > 0) actParts.push(`-${d.facebook_paused} Meta`);

  const actSummary = actParts.length > 0
    ? actParts.join(" · ") + " منشور/إعلان جديد"
    : "لا تغيير ملحوظ هذا الأسبوع";
  const actId = uid("acttxt");
  reqs.push(...reqTextBox(actId, slideId, W * 0.4, 0, W * 0.55, EMU * 0.6,
    [{ text: actSummary, fontSize: 11, colorHex: C.teal, align: "END" }],
  ));

  // ── Left column: analysis ── (x=0.3in to 5.1in)
  const colL = { x: EMU * 0.3, w: EMU * 4.8 };
  const colR = { x: EMU * 5.3, w: EMU * 4.2 };
  let leftY = EMU * 0.75;

  // Summary sentence
  if (ct?.summary) {
    const sumId = uid("sum");
    reqs.push(...reqTextBox(sumId, slideId, colL.x, leftY, colL.w, EMU * 0.5,
      [{ text: ct.summary, italic: true, fontSize: 11, colorHex: C.textMid }],
    ));
    leftY += EMU * 0.6;
  }

  // ✅ What they're doing right
  const good = ct?.good || [];
  if (good.length > 0) {
    const gLbl = uid("glbl");
    reqs.push(...reqRect(gLbl, slideId, colL.x, leftY, colL.w, EMU * 0.3, C.greenBg));
    reqs.push(...reqTextBox(uid("glt"), slideId, colL.x + EMU * 0.1, leftY, colL.w - EMU * 0.2, EMU * 0.3,
      [{ text: "يعملونه صح", bold: true, fontSize: 10, colorHex: C.green }],
    ));
    leftY += EMU * 0.35;

    for (const g of good.slice(0, 2)) {
      const gId = uid("gi");
      reqs.push(...reqTextBox(gId, slideId, colL.x, leftY, colL.w, EMU * 0.38,
        [{ text: `• ${g}`, fontSize: 10, colorHex: C.textDark }],
      ));
      leftY += EMU * 0.4;
    }
    leftY += EMU * 0.1;
  }

  // ❌ Gaps
  const bad = ct?.bad || [];
  if (bad.length > 0) {
    const bLbl = uid("blbl");
    reqs.push(...reqRect(bLbl, slideId, colL.x, leftY, colL.w, EMU * 0.3, "#fff5f5"));
    reqs.push(...reqTextBox(uid("blt"), slideId, colL.x + EMU * 0.1, leftY, colL.w - EMU * 0.2, EMU * 0.3,
      [{ text: "ثغرات نقدر نستفيد منها", bold: true, fontSize: 10, colorHex: C.red }],
    ));
    leftY += EMU * 0.35;

    for (const b of bad.slice(0, 2)) {
      const bId = uid("bi");
      reqs.push(...reqTextBox(bId, slideId, colL.x, leftY, colL.w, EMU * 0.38,
        [{ text: `• ${b}`, fontSize: 10, colorHex: C.textDark }],
      ));
      leftY += EMU * 0.4;
    }
    leftY += EMU * 0.1;
  }

  // Qoyod advantage
  if (ct?.qoyod_advantage) {
    const advBox = uid("advbox");
    reqs.push(...reqRect(advBox, slideId, colL.x, leftY, colL.w, EMU * 0.65, C.tealBg, C.teal));
    reqs.push(...reqTextBox(uid("advt"), slideId, colL.x + EMU * 0.15, leftY, colL.w - EMU * 0.3, EMU * 0.65,
      [
        { text: "ميزة قيود: ", bold: true, fontSize: 10, colorHex: C.teal },
        { text: ct.qoyod_advantage, fontSize: 10, colorHex: C.navy },
      ],
    ));
    leftY += EMU * 0.75;
  }

  // ── Right column: top social posts ──
  const samples = d.top_samples.slice(0, 2);
  let rightY = EMU * 0.75;

  if (samples.length === 0) {
    reqs.push(...reqTextBox(uid("nopost"), slideId, colR.x, rightY, colR.w, EMU * 0.5,
      [{ text: "لا منشورات جديدة هذا الأسبوع", fontSize: 10, colorHex: C.gray, align: "CENTER" }],
    ));
  }

  for (const s of samples) {
    const slotH = samples.length === 1 ? EMU * 3.8 : EMU * 1.85;
    const imgH = s.image_url ? (samples.length === 1 ? EMU * 2.8 : EMU * 1.2) : 0;

    // Post card background
    const card = uid("card");
    reqs.push(...reqRect(card, slideId, colR.x, rightY, colR.w, slotH, C.lightGray, "#e2eaee"));

    // Platform label strip
    const platform = s.source.toUpperCase();
    const plat = uid("plat");
    reqs.push(...reqRect(plat, slideId, colR.x, rightY, colR.w, EMU * 0.28, C.teal));
    reqs.push(...reqTextBox(uid("platt"), slideId, colR.x + EMU * 0.1, rightY, colR.w - EMU * 0.2, EMU * 0.28,
      [{ text: platform, bold: true, fontSize: 9, colorHex: C.white, align: "START" }],
    ));

    // Image
    if (s.image_url) {
      try {
        reqs.push(reqImage(uid("img"), slideId, s.image_url,
          colR.x + EMU * 0.1,
          rightY + EMU * 0.35,
          colR.w - EMU * 0.2,
          imgH,
        ));
      } catch { /* image URL may be expired — skip */ }
    }

    // Post text excerpt
    const postText = (s.hook || s.body || "").slice(0, 120);
    const textY = s.image_url ? rightY + EMU * 0.35 + imgH + EMU * 0.1 : rightY + EMU * 0.35;
    const textH = slotH - (textY - rightY) - EMU * 0.45;
    if (postText && textH > EMU * 0.2) {
      reqs.push(...reqTextBox(uid("ptxt"), slideId, colR.x + EMU * 0.1, textY, colR.w - EMU * 0.2, textH,
        [{ text: `"${postText}"`, italic: true, fontSize: 9, colorHex: C.textMid }],
      ));
    }

    // View post link
    if (s.detail_url) {
      const linkY = rightY + slotH - EMU * 0.38;
      reqs.push(...reqTextBox(uid("lnk"), slideId, colR.x + EMU * 0.1, linkY, colR.w - EMU * 0.2, EMU * 0.35,
        [{ text: "عرض المنشور ←", fontSize: 9, colorHex: C.teal, bold: true, linkUrl: s.detail_url, align: "START" }],
      ));
    }

    rightY += slotH + EMU * 0.15;
  }

  // Proven winners note (if any)
  if (d.proven_winners.length > 0) {
    const pwY = Math.max(leftY, rightY) + EMU * 0.1;
    if (pwY + EMU * 0.55 < H - EMU * 0.3) {
      const pw = uid("pw");
      reqs.push(...reqRect(pw, slideId, EMU * 0.3, pwY, W - EMU * 0.6, EMU * 0.45, C.amberBg, C.amber));
      reqs.push(...reqTextBox(uid("pwt"), slideId, EMU * 0.45, pwY, W - EMU * 0.9, EMU * 0.45,
        [{
          text: `محتوى مثبت (>30 يوم): ${d.proven_winners.slice(0, 2).join(" · ")}`,
          fontSize: 9, colorHex: C.amber,
        }],
      ));
    }
  }

  return reqs;
}

function buildTasksSlide(slideId: string, tasks: Array<{ title: string; owner: string; deadline?: string; why?: string }>): any[] {
  const reqs: any[] = [
    reqCreateSlide(slideId),
    reqSlideBackground(slideId, C.white),
  ];

  // Header
  const hdr = uid("hdr");
  reqs.push(...reqRect(hdr, slideId, 0, 0, W, EMU * 0.6, C.navy));
  reqs.push(...reqTextBox(uid("hdrt"), slideId, EMU * 0.3, 0, W - EMU * 0.6, EMU * 0.6,
    [{ text: "مهام الفريق هذا الأسبوع", bold: true, fontSize: 22, colorHex: C.white }],
  ));

  // Tasks
  const taskH = EMU * 0.72;
  for (let i = 0; i < Math.min(tasks.length, 6); i++) {
    const t = tasks[i];
    const ty = EMU * 0.75 + i * (taskH + EMU * 0.12);
    const bg = i % 2 === 0 ? C.lightGray : C.white;
    const card = uid("tc");
    reqs.push(...reqRect(card, slideId, EMU * 0.3, ty, W - EMU * 0.6, taskH, bg, "#e2eaee"));

    // Number badge
    const badge = uid("badge");
    reqs.push(...reqRect(badge, slideId, EMU * 0.3, ty, EMU * 0.5, taskH, C.teal));
    reqs.push(...reqTextBox(uid("badget"), slideId, EMU * 0.3, ty, EMU * 0.5, taskH,
      [{ text: String(i + 1), bold: true, fontSize: 16, colorHex: C.white, align: "CENTER" }],
    ));

    // Task title + why
    const titleBlocks: TextBlock[] = [
      { text: t.title, bold: true, fontSize: 12, colorHex: C.navy },
    ];
    if (t.why) {
      titleBlocks.push({ text: `\n${t.why}`, italic: true, fontSize: 9, colorHex: C.textMid });
    }
    reqs.push(...reqTextBox(uid("tt"), slideId, EMU * 0.9, ty, W - EMU * 3.8, taskH, titleBlocks));

    // Owner + deadline tags
    const meta = [t.owner, t.deadline].filter(Boolean).join(" · ");
    reqs.push(...reqTextBox(uid("meta"), slideId, W - EMU * 2.8, ty, EMU * 2.4, taskH,
      [{ text: meta, fontSize: 9, colorHex: C.teal, align: "END" }],
    ));
  }

  return reqs;
}

function buildAlertSlide(slideId: string, alert: string): any[] {
  const reqs: any[] = [
    reqCreateSlide(slideId),
    reqSlideBackground(slideId, C.redBg),
  ];

  const strip = uid("strip");
  reqs.push(...reqRect(strip, slideId, 0, 0, W, EMU * 0.12, C.red));

  reqs.push(...reqTextBox(uid("alrt"), slideId,
    EMU, H / 2 - EMU, W - EMU * 2, EMU * 0.6,
    [{ text: "تنبيه عاجل", bold: true, fontSize: 24, colorHex: C.red, align: "CENTER" }],
  ));
  reqs.push(...reqTextBox(uid("alrtbody"), slideId,
    EMU, H / 2 - EMU * 0.3, W - EMU * 2, EMU * 1.5,
    [{ text: alert, fontSize: 16, colorHex: C.textDark, align: "CENTER" }],
  ));

  return reqs;
}

// ─── Main export ─────────────────────────────────────────────────────────────

export interface AIOutput {
  headline?: string;
  competitors?: Array<{
    name: string;
    summary: string;
    good?: string[];
    bad?: string[];
    qoyod_advantage?: string;
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
    const { slides, drive } = getSlidesClient();

    // 1. Create blank presentation via Drive API (avoids Slides API permission
    //    issues on some GCP org policies — Drive already has proven write access).
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

    // 2. Fetch the auto-created default blank slide so we can delete it
    const presInfo = await slides.presentations.get({ presentationId: presId });
    const defaultSlide = presInfo.data.slides?.[0];
    const deleteDefaultReqs = defaultSlide?.objectId
      ? [{ deleteObject: { objectId: defaultSlide.objectId } }]
      : [];

    // 3. Build all slide requests
    const totalActivity = diffs.reduce(
      (s, d) => s + d.facebook_new + d.google_new + d.instagram_new_posts +
                    d.youtube_new_videos + d.tiktok_new_videos + d.snapchat_new_posts + d.linkedin_new_posts,
      0,
    );

    const allRequests: any[] = [...deleteDefaultReqs];

    // Cover
    const coverSlideId = uid("slide");
    allRequests.push(...buildCoverSlide(coverSlideId, weekLabel, totalActivity, diffs.length));

    // Summary
    const summarySlideId = uid("slide");
    allRequests.push(...buildSummarySlide(summarySlideId, ai, diffs, weekLabel));

    // Per-competitor slides (skip fully silent competitors)
    for (const d of diffs) {
      const total = d.facebook_new + d.google_new + d.instagram_new_posts +
                    d.youtube_new_videos + d.tiktok_new_videos + d.snapchat_new_posts + d.linkedin_new_posts;
      if (total === 0 && d.facebook_paused === 0 && d.google_paused === 0) continue;

      const ct = (ai.competitors || []).find(c => c.name.toLowerCase() === d.competitor.toLowerCase());
      const compSlideId = uid("slide");
      allRequests.push(...buildCompetitorSlide(compSlideId, d, ct));
    }

    // Tasks slide
    if (ai.tasks && ai.tasks.length > 0) {
      const tasksSlideId = uid("slide");
      allRequests.push(...buildTasksSlide(tasksSlideId, ai.tasks));
    }

    // Alert slide
    if (ai.alert) {
      const alertSlideId = uid("slide");
      allRequests.push(...buildAlertSlide(alertSlideId, ai.alert));
    }

    // 4. Apply all requests in one batch
    await slides.presentations.batchUpdate({
      presentationId: presId,
      requestBody: { requests: allRequests },
    });

    // 5. Get the final webViewLink (file already in FOLDER_ID from creation)
    const link = driveFile.data.webViewLink ?? `https://docs.google.com/presentation/d/${presId}/edit`;

    return { ok: true, link };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
