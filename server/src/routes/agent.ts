import { Router } from "express";
import crypto from "crypto";
import { canvaUploadSvgAndCreateDesign } from "./canva.js";
import { driveUploadText, driveUploadAsGoogleDoc } from "./drive.js";
import { sheetsAppendBrief } from "../lib/sheets-client.js";
import { logger, taskLogger } from "../lib/logger.js";
import { loadTasks, saveTasks, type PersistedTask } from "../lib/agent-store.js";
import { cacheLookup, cacheStore, cacheStats, cacheClear } from "../lib/agent-cache.js";
import {
  addRecall,
  buildMemoryBlock,
  deleteFact,
  deleteNote,
  listFacts,
  readNotes,
  recentRecall,
  upsertFact,
  writeNote,
} from "../lib/agent-memory.js";
import { parseMentions } from "../lib/agent-mentions.js";
import {
  addSchedule,
  deleteSchedule,
  listSchedules,
  startScheduler,
  toggleSchedule,
  type Schedule,
} from "../lib/agent-schedule.js";
import {
  PERSONAS,
  personaTools,
  pickPersona,
  type PersonaId,
} from "../lib/agent-personas.js";
import {
  upsertEntry,
  listEntries,
  saveCompetitorPosts,
  libraryStats,
  type ContentEntry,
  type CompetitorPost,
} from "../lib/content-library.js";

/* ══════════════════════════════════════════════════════════════════
   Qoyod Creative Agent — autonomous loop

   The agent listens for three kinds of triggers:
     1. Manual "run" from the CreativeOS UI  (POST /api/agent/run)
     2. @mention or task-assignment ingested via webhook from Slack,
        HubSpot, Asana, Email, etc.                (POST /api/agent/webhook)
     3. Direct programmatic push                    (POST /api/agent/mention)

   When triggered, it enters a Claude tool-use loop and can:
     - Draft ad copy / captions / content topics
     - Generate SVG ad creatives
     - Generate Nano Banana images
     - Draft landing-page HTML
     - Build a content calendar / email sequence / campaign plan
     - Review copy against Qoyod voice
     - Publish to WordPress, HubSpot, Canva, Drive, Miro

   All work is tracked in an in-memory task store with step-level logging
   so the UI can show an activity feed per task.
   ══════════════════════════════════════════════════════════════════ */

const router = Router();

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5";

const MAX_AGENT_STEPS = 12;

type StepKind = "think" | "tool_use" | "tool_result" | "error" | "finish";
interface Step {
  ts: number;
  kind: StepKind;
  tool?: string;
  message?: string;
  input?: unknown;
  output?: unknown;
}
interface Trigger {
  source: "ui" | "webhook" | "mention" | "email" | "task";
  actor?: string;          // who @mentioned / assigned
  channel?: string;        // slack channel, email thread, etc.
  title?: string;          // task title
  body?: string;           // the message body / mention text / task description
  context?: Record<string, unknown>; // any extra structured context
}
interface Task {
  id: string;
  created_at: number;
  updated_at: number;
  trigger: Trigger;
  status: "queued" | "thinking" | "running" | "done" | "error";
  steps: Step[];
  outputs: Record<string, unknown>;
  summary?: string;
  error?: string;
  priority?: "low" | "normal" | "high";
  schedule_id?: string;
  persona?: PersonaId;
}

const TASKS = new Map<string, Task>();
const TASK_CAP = 100;                // keep last 100 tasks in memory

/* Trigger dedup — if the same body hits within 60s we skip. */
const DEDUP_WINDOW_MS = 60_000;
const recentTriggerHashes = new Map<string, number>();
function triggerHash(t: Trigger): string {
  return crypto
    .createHash("sha1")
    .update(`${t.source}|${t.actor ?? ""}|${t.title ?? ""}|${t.body ?? ""}`)
    .digest("hex");
}
function isDuplicate(t: Trigger): boolean {
  const h = triggerHash(t);
  const last = recentTriggerHashes.get(h);
  const now = Date.now();
  /* Garbage-collect old entries */
  for (const [k, ts] of recentTriggerHashes) {
    if (now - ts > DEDUP_WINDOW_MS) recentTriggerHashes.delete(k);
  }
  if (last && now - last < DEDUP_WINDOW_MS) return true;
  recentTriggerHashes.set(h, now);
  return false;
}

/* Rehydrate on boot so the UI sees prior history after a restart. */
(function seedFromDisk() {
  try {
    for (const p of loadTasks() as PersistedTask[]) {
      /* Anything left "running" or "thinking" after a crash is marked error. */
      const status =
        p.status === "running" || p.status === "thinking" || p.status === "queued"
          ? "error"
          : (p.status as Task["status"]);
      TASKS.set(p.id, {
        id: p.id,
        created_at: p.created_at,
        updated_at: p.updated_at,
        trigger: p.trigger as Trigger,
        status,
        steps: p.steps as Step[],
        outputs: p.outputs ?? {},
        summary: p.summary,
        error: p.error ?? (status === "error" ? "server restart interrupted task" : undefined),
        priority: p.priority,
        schedule_id: p.schedule_id,
        persona: p.persona as PersonaId | undefined,
      });
    }
  } catch (e) {
    logger.warn({ err: String(e) }, "agent: seed from disk failed");
  }
})();

function persist() {
  const snap: PersistedTask[] = [...TASKS.values()].map((t) => ({
    id: t.id,
    created_at: t.created_at,
    updated_at: t.updated_at,
    status: t.status,
    trigger: t.trigger,
    steps: t.steps,
    outputs: t.outputs,
    summary: t.summary,
    error: t.error,
    priority: t.priority,
    schedule_id: t.schedule_id,
    persona: t.persona,
  } as PersistedTask));
  saveTasks(snap);
}

function newTaskId() {
  return "t_" + crypto.randomBytes(6).toString("hex");
}
function pushStep(task: Task, step: Omit<Step, "ts">) {
  task.steps.push({ ts: Date.now(), ...step });
  task.updated_at = Date.now();
  persist();
}
function trimTasks() {
  if (TASKS.size <= TASK_CAP) return;
  const ordered = [...TASKS.entries()].sort(([, a], [, b]) => a.created_at - b.created_at);
  while (TASKS.size > TASK_CAP) {
    const first = ordered.shift();
    if (!first) break;
    TASKS.delete(first[0]);
  }
}

/* ─────────────────────────────────────────────────────────────
   SYSTEM PROMPT — tells Claude how to behave as the creative agent
   ───────────────────────────────────────────────────────────── */
const SYSTEM_PROMPT = `You are the Qoyod Creative Agent — an autonomous AI marketing assistant for Qoyod, a Saudi ZATCA-certified cloud accounting SaaS.

You are triggered when a teammate @mentions you, assigns you a task, or clicks "Run agent" in the CreativeOS app. Your job is to understand the request, plan the minimum set of steps, call the right tools, and produce a concrete output (ad copy, SVG ad, landing page, calendar, email sequence, campaign plan, etc.) — optionally publishing it to WordPress, HubSpot, Canva, Drive, or Miro.

VOICE & BRAND (apply to all copy you produce):
- Arabic copy MUST be Saudi dialect (مو / وش / ليش). NEVER Egyptian (مش / ايه / ازاي).
- Tone: engaging, confident, professional, clear. Give more than expected.
- NEVER use emojis in any generated marketing content (captions, ads, articles, emails, landing pages). Emojis are forbidden in all output.
- Primary palette: Navy #021544, Deep Turquoise #01355A, Accent Turquoise #17A3A4.
- Products: Qoyod Main (accounting + e-invoice), QFlavours (F&B POS), QoyodPOS (retail), QBookkeeping (outsourced), VAT, E-Invoice (ZATCA Ph2), API Integration, seasonal offers.
- Every ad must: be mobile-first, have 1 hook, 1 message, 1 CTA, 1 trust element (ZATCA / SOCPA / 25,000+ businesses).

COMMUNICATION RULES (your summary, Slack replies, status messages):
- ALL system communications must be in ENGLISH. Only the actual marketing content you generate stays in Arabic.
- NO emojis anywhere — not in summaries, not in section headers, not in lists. Use plain text only.
- For analysis tasks (post review, competitor scan, metrics, landing page audit): write the FULL analysis directly in your final summary as a structured human-readable report. Do NOT save the analysis as an HTML or Drive file unless the user explicitly asks for a file.
- Use this structure for analysis summaries:
    Title: short descriptive line
    Context: 1 line
    Findings: numbered list (1, 2, 3) with 1-2 sentences each
    Recommendations: numbered list with concrete next actions
    Links: any relevant URLs as plain text

OPERATING RULES:
1. Break the user's request into the smallest useful set of tool calls — do not over-generate.
2. Prefer one strong asset over many weak ones. A/B variants are fine when explicitly asked.
3. If the request is ambiguous, make a concrete reasonable assumption and proceed — do not ask follow-ups.
4. After all tool calls, write your final summary in ENGLISH following the structure above. Include public URLs as plain text (no markdown link syntax).
5. Never invent ZATCA claims that are not true. Qoyod is ZATCA Phase-2 compliant.
6. Never publish to WordPress/HubSpot without an explicit instruction. If the trigger mentions "publish" / "نشر" / "draft live", proceed.
7. NEVER call save_to_drive automatically. Only call it when the user explicitly says "save to Drive", "احفظه في Drive", "ارفعه", "share as doc", or similar. Delivering content in the summary is always sufficient unless told otherwise.

STRICT SINGLE-CHANNEL RULE:
- If the user specifies one channel (e.g. Instagram, LinkedIn, TikTok), call generate_content ONCE for that channel only. Do NOT generate copies for other channels unless the user explicitly says "all channels" / "كل القنوات" / "لكل القنوات".
- If the user specifies no channel, generate for Instagram only (default) and mention you can do other channels if needed.

STRICT SINGLE-SIZE RULE (for ads/SVG):
- If the user specifies one size/ratio (e.g. 1:1), call generate_ad_svg ONCE for that size only. Do NOT auto-generate other sizes.
- After delivering the one requested size, end your message with a line like: "يمكنني إنشاء نفس التصميم بأحجام أخرى (4:5 / 9:16 / 16:9) — فقط اطلب." — but do NOT call the tool again.
- Only generate multiple sizes if the user says "كل الأحجام" / "all sizes" / "جهّزها لكل المنصات".

DESIGN TOOL SELECTION:
You have 3 design tools — choose based on what the user asks for:
1. generate_ad_svg — branded SVG ad with Qoyod template (navy + teal, Arabic text, CTA button). Use for: social ads, banners, campaigns.
2. generate_nb_image — Google Gemini AI photorealistic/illustrated image. Use for: lifestyle photos, product mockups, abstract visuals.
3. generate_openai_image — DALL-E 3 high-quality artistic image. Use for: creative concepts, stylised artwork, when user says "ChatGPT image" or "DALL-E".
Default to generate_ad_svg for ad requests. Use generate_nb_image or generate_openai_image only when the user explicitly asks for a "photo", "AI image", "real image", or names one of these tools.`;

/* ─────────────────────────────────────────────────────────────
   BRAND FACTS — lightweight KV the agent can consult before writing
   ───────────────────────────────────────────────────────────── */
const BRAND_FACTS = {
  palette: {
    navy: "#021544",
    deep_turquoise: "#01355A",
    accent_turquoise: "#17A3A4",
    usage: "Navy = primary background. Teal = CTAs, accents, data highlights. White on navy, navy on teal.",
  },
  fonts: {
    arabic: "IBM Plex Sans Arabic",
    latin: "Space Grotesk",
    design_system: "Lama Sans (in Figma specs)",
  },
  products: [
    "Qoyod Main — accounting + e-invoicing (ZATCA Phase 2 compliant)",
    "QFlavours — F&B POS",
    "QoyodPOS — retail POS",
    "QBookkeeping — outsourced bookkeeping",
    "VAT module",
    "E-Invoice (ZATCA Phase 2)",
    "API Integration",
  ],
  trust: [
    "ZATCA Phase 2 certified",
    "SOCPA-aligned",
    "+25,000 Saudi businesses",
    "Arabic-first, 24/7 support",
  ],
  dialect: {
    allowed: ["مو", "وش", "ليش", "كم", "عندك", "بسرعة"],
    forbidden: ["مش", "ايه", "ازاي", "بتاع", "يلا"],
    rule: "Saudi dialect only. Never Egyptian. Never mix dialects in one asset.",
  },
  cta_patterns: [
    "ابدأ مجاناً",
    "جرّب الآن",
    "احجز عرضك",
    "اطلب العرض",
    "سجّل اليوم",
    "جدولة مكالمة",
  ],
} as const;

/* ─────────────────────────────────────────────────────────────
   TOOL DEFINITIONS (JSON schemas exposed to Claude)
   ───────────────────────────────────────────────────────────── */
const TOOLS = [
  {
    name: "generate_content",
    description:
      "Generate Arabic/Saudi ad copy, social captions, or article drafts for a given Qoyod product + funnel stage. Returns the copy as text.",
    input_schema: {
      type: "object",
      properties: {
        product: { type: "string", description: "Qoyod product name (e.g. 'Qoyod Main', 'QFlavours')" },
        funnel: { type: "string", enum: ["TOF", "MOF", "BOF"] },
        channel: { type: "string", description: "Instagram / Snapchat / LinkedIn / Twitter / Email / etc." },
        hook_type: {
          type: "string",
          enum: ["Fear", "Time", "Simplicity", "Control", "SocialProof", "BeforeAfter", "Auto"],
        },
        brief: { type: "string", description: "Optional extra notes about message angle" },
        variants: { type: "number", description: "How many hook variants (default 3)" },
      },
      required: ["product", "funnel", "channel"],
    },
  },
  {
    name: "generate_ad_svg",
    description:
      "Generate a complete SVG ad creative (Navy + Teal brand) for Qoyod. Returns the SVG string and its dimensions.",
    input_schema: {
      type: "object",
      properties: {
        product: { type: "string" },
        message: { type: "string", description: "Main Arabic headline" },
        hook: { type: "string", description: "Secondary line (Arabic)" },
        cta: { type: "string", description: "CTA button text (Arabic)" },
        trust: { type: "string", description: "Trust badge, e.g. 'ZATCA Phase 2'" },
        ratio: { type: "string", enum: ["1:1", "4:5", "9:16", "16:9"] },
        concept: { type: "string" },
        color_scheme: {
          type: "string",
          enum: ["navy", "teal", "ocean", "light", "midnight", "slate", "auto"],
          description: "Color scheme. navy=dark navy bg (default), teal=teal bg, ocean=deep blue-green, light=white bg, midnight=near-black, slate=cool grey-blue, auto=rotate. Pick based on context or user preference.",
        },
        color_accent: { type: "string", description: "Legacy: override accent hex (use color_scheme instead)" },
      },
      required: ["product", "message", "cta", "ratio"],
    },
  },
  {
    name: "generate_nb_image",
    description:
      "Generate a photorealistic or illustrated image via Google Gemini (gemini-2.5-flash-image / Imagen 2). Great for lifestyle, product mockups, and scene images. Returns a data-URL + optional Drive link.",
    input_schema: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description: "Detailed English description of the image. Be specific about style, lighting, subject.",
        },
        save_to_drive_as: {
          type: "string",
          description: "If provided, persist the PNG to the team Drive under this filename (e.g. 'qoyod-hero.png').",
        },
      },
      required: ["prompt"],
    },
  },
  {
    name: "generate_openai_image",
    description:
      "Generate a high-quality image via OpenAI DALL-E 3. Best for artistic, stylised, or concept ads. Returns a data-URL + optional Drive link. Requires OPENAI_API_KEY.",
    input_schema: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description: "Detailed English prompt. Be specific about style, composition, mood, brand colours (#021544 navy, #17A3A4 teal).",
        },
        size: {
          type: "string",
          enum: ["1024x1024", "1792x1024", "1024x1792"],
          description: "1024x1024 = square (Instagram), 1792x1024 = landscape, 1024x1792 = portrait/stories. Default: 1024x1024",
        },
        quality: {
          type: "string",
          enum: ["hd", "standard"],
          description: "hd = more detail, standard = faster. Default: hd",
        },
        style: {
          type: "string",
          enum: ["vivid", "natural"],
          description: "vivid = hyper-real/dramatic, natural = realistic/subtle. Default: vivid",
        },
        save_to_drive_as: {
          type: "string",
          description: "If provided, persist the PNG to the team Drive under this filename.",
        },
      },
      required: ["prompt"],
    },
  },
  {
    name: "build_landing_page_html",
    description:
      "Draft a mobile-first Arabic RTL landing page (self-contained HTML + CSS, no external images) for a Qoyod product.",
    input_schema: {
      type: "object",
      properties: {
        product: { type: "string" },
        headline: { type: "string" },
        angle: { type: "string" },
        cta_text: { type: "string" },
        include_form: { type: "boolean" },
      },
      required: ["product", "headline"],
    },
  },
  {
    name: "build_campaign_plan",
    description:
      "Produce a 360° campaign plan JSON (objectives, channels, phases, weekly post cadence, budget guidance).",
    input_schema: {
      type: "object",
      properties: {
        theme: { type: "string" },
        type: { type: "string", enum: ["Seasonal", "Launch", "Awareness", "Lead-Gen", "Retention"] },
        objective: { type: "string", enum: ["Leads", "Awareness", "Sales", "Retention"] },
        channels: { type: "array", items: { type: "string" } },
        duration_weeks: { type: "number" },
        product: { type: "string" },
      },
      required: ["theme", "objective", "product"],
    },
  },
  {
    name: "build_content_calendar",
    description: "Produce a weekly content calendar with post ideas per channel.",
    input_schema: {
      type: "object",
      properties: {
        product: { type: "string" },
        weeks: { type: "number" },
        channels: { type: "array", items: { type: "string" } },
        sector: { type: "string" },
      },
      required: ["product", "weeks"],
    },
  },
  {
    name: "build_email_sequence",
    description: "Draft an email nurture sequence (subject + preview + body per email).",
    input_schema: {
      type: "object",
      properties: {
        product: { type: "string" },
        segment: { type: "string", description: "Target persona / ICP" },
        emails: { type: "number", description: "How many emails in the sequence" },
      },
      required: ["product", "segment", "emails"],
    },
  },
  {
    name: "review_copy",
    description:
      "Review a piece of copy for Qoyod brand voice, Saudi dialect, clarity, one-message rule. Returns issues + rewrite suggestions.",
    input_schema: {
      type: "object",
      properties: {
        copy: { type: "string" },
        language: { type: "string", enum: ["ar", "en"] },
      },
      required: ["copy"],
    },
  },
  {
    name: "publish_wordpress",
    description:
      "Publish a draft page to WordPress. Requires WP_SITE_URL / WP_USERNAME / WP_APP_PASSWORD env vars.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        html: { type: "string" },
        slug: { type: "string" },
      },
      required: ["title", "html"],
    },
  },
  {
    name: "publish_hubspot",
    description: "Create a draft landing/site page in HubSpot. Requires HS_ACCESS_TOKEN.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        html: { type: "string" },
        slug: { type: "string" },
      },
      required: ["title", "html"],
    },
  },
  {
    name: "upload_canva",
    description: "Upload an SVG to Canva and create a new design from it. Requires Canva OAuth to be connected.",
    input_schema: {
      type: "object",
      properties: {
        svg: { type: "string" },
        name: { type: "string" },
        design_type: { type: "string", description: "Canva preset, e.g. 'SocialMedia'" },
      },
      required: ["svg", "name"],
    },
  },
  {
    name: "save_to_drive",
    description:
      "Save a content artifact to the Qoyod team Drive folder as a native Google Doc (for text/markdown/HTML) or raw file (for CSV/SVG). Returns an edit link. ONLY call this when the user explicitly requests saving to Drive.",
    input_schema: {
      type: "object",
      properties: {
        filename: { type: "string" },
        content: { type: "string" },
        mimeType: { type: "string" },
      },
      required: ["filename", "content", "mimeType"],
    },
  },
  {
    name: "analyze_landing_page",
    description:
      "Fetch a public URL and critique it as a growth marketer. Returns {headline_clarity, value_prop, cta, trust, mobile, risks[], fixes[]}. Use before redesigning a landing page.",
    input_schema: {
      type: "object",
      properties: {
        url: { type: "string" },
        focus: { type: "string", enum: ["conversion", "clarity", "arabic-quality", "seo", "all"] },
      },
      required: ["url"],
    },
  },
  {
    name: "translate_copy",
    description:
      "Translate copy between Arabic (Saudi dialect) and English while preserving Qoyod voice. Never outputs Egyptian Arabic.",
    input_schema: {
      type: "object",
      properties: {
        text: { type: "string" },
        to: { type: "string", enum: ["ar", "en"] },
        register: { type: "string", enum: ["ad", "long-form", "formal"] },
      },
      required: ["text", "to"],
    },
  },
  {
    name: "generate_video_script",
    description:
      "Write a short-form video script (TikTok / Reels / Shorts) with scene-by-scene camera + voiceover + on-screen text.",
    input_schema: {
      type: "object",
      properties: {
        product: { type: "string" },
        hook: { type: "string" },
        duration_sec: { type: "number", description: "15, 30, 45, or 60" },
        channel: { type: "string", enum: ["TikTok", "Reels", "Shorts", "Snap"] },
        cta: { type: "string" },
      },
      required: ["product", "duration_sec", "channel"],
    },
  },
  {
    name: "generate_seo_meta",
    description:
      "Produce Arabic-first SEO meta (title, meta description, Open Graph, 5-10 keywords) for a Qoyod page.",
    input_schema: {
      type: "object",
      properties: {
        topic: { type: "string" },
        product: { type: "string" },
        language: { type: "string", enum: ["ar", "en"] },
      },
      required: ["topic"],
    },
  },
  {
    name: "plan_ab_test",
    description:
      "Design a clean A/B test (or A/B/C) for a given growth hypothesis. Returns variant specs, success metric, sample size guidance, kill criteria.",
    input_schema: {
      type: "object",
      properties: {
        hypothesis: { type: "string" },
        surface: { type: "string", description: "e.g. 'landing page hero', 'Meta ad', 'email subject'" },
        variants: { type: "number" },
      },
      required: ["hypothesis", "surface"],
    },
  },
  {
    name: "generate_hashtags",
    description: "Suggest 8-15 Saudi/Gulf-market hashtags for a given topic + channel.",
    input_schema: {
      type: "object",
      properties: {
        topic: { type: "string" },
        channel: { type: "string", enum: ["Instagram", "TikTok", "Twitter", "LinkedIn", "Snapchat"] },
      },
      required: ["topic"],
    },
  },
  {
    name: "brief_to_spec",
    description:
      "Expand a 1-line brief into a structured marketing spec (goal, audience, message hierarchy, channels, assets, KPIs). Great first step before other tools.",
    input_schema: {
      type: "object",
      properties: {
        brief: { type: "string" },
      },
      required: ["brief"],
    },
  },
  {
    name: "generate_miro_board",
    description:
      "Create a Miro board visualizing a workflow / funnel for Qoyod. Returns the board URL.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        description: { type: "string" },
      },
      required: ["name"],
    },
  },
  {
    name: "analyze_competitor_content",
    description:
      "Analyze a competitor's public content (URL or handle) for themes, tone, hooks, posting cadence, and gaps Qoyod can exploit.",
    input_schema: {
      type: "object",
      properties: {
        competitor: { type: "string", description: "Name, URL, or social handle" },
        channel: { type: "string" },
        goal: {
          type: "string",
          enum: ["content_gap", "hook_analysis", "posting_cadence", "messaging"],
        },
      },
      required: ["competitor"],
    },
  },
  {
    name: "generate_google_ads_rsa",
    description:
      "Draft a Google Ads Responsive Search Ad (RSA): 15 headlines + 4 descriptions, Saudi Arabic + English, with character counts validated.",
    input_schema: {
      type: "object",
      properties: {
        product: { type: "string" },
        landing_url: { type: "string" },
        keywords: { type: "array", items: { type: "string" } },
        funnel: { type: "string", enum: ["TOF", "MOF", "BOF"] },
        language: { type: "string", enum: ["ar", "en", "bilingual"] },
      },
      required: ["product", "keywords"],
    },
  },
  {
    name: "build_blog_article",
    description:
      "Write a long-form SEO blog article (Arabic or English) with H1/H2s, intro, body, FAQ schema block, and internal-link suggestions.",
    input_schema: {
      type: "object",
      properties: {
        topic: { type: "string" },
        primary_keyword: { type: "string" },
        secondary_keywords: { type: "array", items: { type: "string" } },
        language: { type: "string", enum: ["ar", "en"] },
        word_count: { type: "number" },
      },
      required: ["topic", "primary_keyword"],
    },
  },
  {
    name: "analyze_metrics_report",
    description:
      "Given a JSON blob of campaign or landing-page metrics, return an insights report with 3 actions for next 14 days.",
    input_schema: {
      type: "object",
      properties: {
        metrics: { type: "object", description: "Any metrics JSON — impressions, clicks, CVR, CPA, LP sessions, etc." },
        context: { type: "string" },
      },
      required: ["metrics"],
    },
  },
  {
    name: "build_press_release",
    description: "Bilingual (ar+en) press release for Qoyod announcements.",
    input_schema: {
      type: "object",
      properties: {
        headline: { type: "string" },
        body_points: { type: "array", items: { type: "string" } },
        quote_from: { type: "string", description: "Executive name + title for the quote" },
        embargo_date: { type: "string" },
      },
      required: ["headline", "body_points"],
    },
  },
  {
    name: "slack_post",
    description:
      "Post a message to a Slack channel (optionally threaded). ONLY call this when the user explicitly asks you to send a Slack message. Do NOT call this automatically or proactively. Requires SLACK_BOT_TOKEN.",
    input_schema: {
      type: "object",
      properties: {
        channel: { type: "string", description: "Channel ID or name like #marketing" },
        text: { type: "string" },
        thread_ts: { type: "string", description: "Optional — reply in a thread" },
      },
      required: ["channel", "text"],
    },
  },
  {
    name: "create_asana_task",
    description:
      "Create an Asana task in a specified project. Requires ASANA_ACCESS_TOKEN (Personal Access Token from the Asana Developer Console).",
    input_schema: {
      type: "object",
      properties: {
        project_gid: { type: "string" },
        name: { type: "string" },
        notes: { type: "string" },
        assignee: { type: "string", description: "User gid or 'me'" },
      },
      required: ["project_gid", "name"],
    },
  },
  {
    name: "brand_fact_lookup",
    description:
      "Quick lookup of Qoyod brand/product facts (palette, fonts, products, trust elements, forbidden dialect words). Use before writing copy when unsure.",
    input_schema: {
      type: "object",
      properties: {
        topic: {
          type: "string",
          enum: ["palette", "fonts", "products", "trust", "dialect", "cta_patterns"],
        },
      },
      required: ["topic"],
    },
  },
  {
    name: "memory_write",
    description:
      "Jot a short note to long-term memory scoped to the current persona, so the next run picks it up. Use for learnings: 'winning hook: …', 'Zain campaign performed 2x on Reels', etc. ≤240 chars.",
    input_schema: {
      type: "object",
      properties: {
        text: { type: "string", description: "The note. Short and concrete." },
      },
      required: ["text"],
    },
  },
  {
    name: "memory_read",
    description:
      "Read recent persona notes + recent task recall for the current persona. Call at the start of a task if you suspect context from past runs matters.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "content_library_save",
    description:
      "Save a published Qoyod content piece to the team content library. Call this every time a new social post or asset is produced/detected, so the agent learns over time.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Unique ID — broadcast_guid or generated slug" },
        type: { type: "string", enum: ["post", "reel", "story", "email", "ad", "blog", "other"] },
        channel: { type: "string", description: "Instagram / LinkedIn / Facebook / etc." },
        published_at: { type: "string", description: "ISO timestamp" },
        content_text: { type: "string" },
        post_url: { type: "string" },
        thumb_url: { type: "string" },
        media_type: { type: "string" },
        topic: { type: "string", description: "What product/concept this covers" },
        hashtags: { type: "array", items: { type: "string" } },
        tone: { type: "string", description: "educational / promotional / community / humour" },
        quality: {
          type: "object",
          description: "Quality scores (fill after reviewing the post)",
          properties: {
            brand_voice: { type: "number" },
            dialect_correct: { type: "boolean" },
            hook_strength: { type: "number" },
            clarity: { type: "number" },
            notes: { type: "string" },
          },
        },
        optimization: {
          type: "object",
          description: "Optimization insights (fill after competitor research)",
          properties: {
            what_works: { type: "string" },
            what_to_improve: { type: "string" },
            competitor_insight: { type: "string" },
            suggested_variant: { type: "string" },
          },
        },
      },
      required: ["id", "type", "channel", "published_at", "content_text"],
    },
  },
  {
    name: "content_library_read",
    description:
      "Read past Qoyod posts from the content library. Use before generating new content to learn from what was already published.",
    input_schema: {
      type: "object",
      properties: {
        channel: { type: "string" },
        topic: { type: "string" },
        limit: { type: "number", description: "Max results (default 10)" },
      },
    },
  },
  {
    name: "search_competitor_content",
    description:
      "Search the web for recent public content from Qoyod's Saudi competitors (Wafeq, Sahl, Dafater, Zid, Foodics, Zoho Books) on a given topic. Returns post excerpts, angles, and engagement signals to benchmark against Qoyod.",
    input_schema: {
      type: "object",
      properties: {
        topic: { type: "string", description: "Topic to search, e.g. 'فاتورة الكترونية', 'ZATCA', 'محاسبة سحابية'" },
        competitor: { type: "string", description: "Optional: specific competitor name to focus on" },
        channel: { type: "string", description: "Optional: Instagram / LinkedIn / general" },
      },
      required: ["topic"],
    },
  },
] as const;

/* ─────────────────────────────────────────────────────────────
   INTERNAL HELPERS — run a single tool
   ───────────────────────────────────────────────────────────── */
async function callAnthropic(body: unknown): Promise<any> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");
  const r = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const err = await r.text();
    throw new Error(`Anthropic ${r.status}: ${err}`);
  }
  return r.json();
}

function extractText(content: Array<{ type: string; text?: string }>): string {
  return content.filter((b) => b.type === "text").map((b) => b.text ?? "").join("").trim();
}

/* Claude-subcall helper used by many "generate_*" tools */
async function claudeText(system: string, user: string, max_tokens = 2000): Promise<string> {
  const data = await callAnthropic({ model: MODEL, max_tokens, system, messages: [{ role: "user", content: user }] });
  return extractText(data.content ?? []);
}

/* ─────────────────────────────────────────────────────────────
   TOOL DISPATCH — every tool name maps to a handler
   ───────────────────────────────────────────────────────────── */
async function runTool(name: string, input: any, ctx?: { personaId?: string }): Promise<unknown> {
  switch (name) {
    case "generate_content": {
      const {
        product,
        funnel,
        channel,
        hook_type = "Auto",
        brief = "",
        variants = 3,
      } = input;
      const sys = `You are a senior Arabic copywriter for Qoyod. Write in Saudi dialect (مو / وش / ليش — NEVER Egyptian). Always: one hook, one message, one CTA. Tone: confident, warm, professional.`;
      const usr = `Write ad copy for ${product} (${funnel}) on ${channel}. Hook angle: ${hook_type}. Extra: ${brief}.
Return JSON: {"hooks":[${variants} short Saudi-dialect hooks], "message":"...", "cta":"...", "trust":"..."}. Reply with JSON only.`;
      const text = await claudeText(sys, usr, 1200);
      return safeJSON(text) ?? { raw: text };
    }
    case "generate_ad_svg": {
      const r = await fetch(`http://127.0.0.1:${process.env.PORT || 8080}/api/generate-design`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      return r.json();
    }
    case "generate_nb_image": {
      const { prompt, save_to_drive_as } = input;
      const r = await fetch(`http://127.0.0.1:${process.env.PORT || 8080}/api/nb/generate-image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data: any = await r.json();
      if (!r.ok) return { error: data.error ?? `HTTP ${r.status}` };
      const out: Record<string, unknown> = {
        mimeType: data.mimeType,
        dataUrl: data.dataUrl?.slice(0, 120) + "…",
      };
      if (save_to_drive_as && data.base64) {
        /* Drive helper only takes text/utf-8, so we keep the base64 as a .txt sidecar
           — or upload the raw bytes using the standard /api/drive/upload route. */
        const up = await fetch(
          `http://127.0.0.1:${process.env.PORT || 8080}/api/drive/upload`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              content: data.base64,
              binaryBase64: true,
              filename: save_to_drive_as,
              mimeType: data.mimeType ?? "image/png",
            }),
          }
        );
        const upd: any = await up.json();
        if (upd?.link) out.drive_link = upd.link;
        if (upd?.error) out.drive_error = upd.error;
      }
      return out;
    }
    case "generate_openai_image": {
      const {
        prompt,
        size = "1024x1024",
        quality = "hd",
        style = "vivid",
        save_to_drive_as,
      } = input;
      const r = await fetch(`http://127.0.0.1:${process.env.PORT || 8080}/api/nb/generate-image-openai`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, size, quality, style }),
      });
      const data: any = await r.json();
      if (!r.ok) return { error: data.error ?? `HTTP ${r.status}` };
      const out: Record<string, unknown> = {
        mimeType: data.mimeType,
        dataUrl: data.dataUrl?.slice(0, 120) + "…",
        model: data.model,
        revised_prompt: data.revised_prompt,
      };
      if (save_to_drive_as && data.base64) {
        const up = await fetch(
          `http://127.0.0.1:${process.env.PORT || 8080}/api/drive/upload`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              content: data.base64,
              binaryBase64: true,
              filename: save_to_drive_as,
              mimeType: "image/png",
            }),
          }
        );
        const upd: any = await up.json();
        if (upd?.link) out.drive_link = upd.link;
        if (upd?.error) out.drive_error = upd.error;
      }
      return out;
    }
    case "build_landing_page_html": {
      const { product, headline, angle = "", cta_text = "ابدأ الآن", include_form = true } = input;
      const sys = `You produce self-contained mobile-first RTL Arabic landing pages for Qoyod. Inline <style>. No external images (use inline SVG / CSS). Navy #021544 + Teal #17A3A4 brand. Use <html lang="ar" dir="rtl">. Single file, <!DOCTYPE html> … </html>. Return ONLY the HTML.`;
      const usr = `Product: ${product}
Hero headline: "${headline}"
Angle: ${angle}
CTA: "${cta_text}"
Include lead form: ${include_form ? "yes" : "no"}`;
      const html = await claudeText(sys, usr, 4000);
      return { html };
    }
    case "build_campaign_plan": {
      const { theme, type = "Seasonal", objective, channels = [], duration_weeks = 4, product } = input;
      const sys = `You are Qoyod's senior growth marketer. Output JSON only.`;
      const usr = `Build a ${duration_weeks}-week ${type} campaign plan for product: ${product}. Theme: "${theme}". Objective: ${objective}. Channels: ${channels.join(", ")}.
JSON schema: {"phases":[{"week":1,"focus":"...","assets":["..."],"channels":["..."],"kpis":["..."]}], "cta":"...", "budget_split":{"Meta":%,"TikTok":%,"Snapchat":%,"Google":%,"LinkedIn":%}, "risks":["..."]}.`;
      const text = await claudeText(sys, usr, 2500);
      return safeJSON(text) ?? { raw: text };
    }
    case "build_content_calendar": {
      const { product, weeks = 2, channels = ["Instagram", "LinkedIn", "Twitter"], sector = "General" } = input;
      const sys = `You are Qoyod's content calendar planner. Output JSON.`;
      const usr = `Draft a ${weeks}-week content calendar for ${product} (sector: ${sector}) across: ${channels.join(", ")}.
JSON: {"weeks":[{"week":1,"posts":[{"day":"Sun","channel":"Instagram","funnel":"TOF","hook":"...","caption":"...","format":"Static"}]}]}. Include a mix of TOF/MOF/BOF posts. Arabic Saudi dialect.`;
      const text = await claudeText(sys, usr, 3500);
      return safeJSON(text) ?? { raw: text };
    }
    case "build_email_sequence": {
      const { product, segment, emails = 4 } = input;
      const sys = `You are Qoyod's lifecycle email copywriter. Output JSON only.`;
      const usr = `Draft a ${emails}-email nurture sequence for ${product} targeting "${segment}". Arabic Saudi dialect.
JSON: {"sequence":[{"idx":1,"subject":"...","preview":"...","body_html":"<p>…</p>","cta":"..."}]}`;
      const text = await claudeText(sys, usr, 3500);
      return safeJSON(text) ?? { raw: text };
    }
    case "review_copy": {
      const { copy, language = "ar" } = input;
      const sys = `You are Qoyod's editorial reviewer. Strict Saudi dialect check (flag any Egyptian mش/ايه/ازاي). Check: 1-hook, 1-message, 1-CTA, trust element present, ZATCA claims accurate.`;
      const usr = `Language: ${language}\nCopy:\n${copy}\n\nReturn JSON: {"score":0-100,"issues":["..."],"rewrite":"..."}`;
      const text = await claudeText(sys, usr, 1500);
      return safeJSON(text) ?? { raw: text };
    }
    case "publish_wordpress": {
      const { title, html, slug } = input;
      const r = await fetch(`http://127.0.0.1:${process.env.PORT || 8080}/api/wp-draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content: html, slug }),
      });
      return r.json();
    }
    case "publish_hubspot": {
      const { title, html, slug } = input;
      const r = await fetch(`http://127.0.0.1:${process.env.PORT || 8080}/api/hs-draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content: html, slug }),
      });
      return r.json();
    }
    case "upload_canva": {
      const { svg, name } = input;
      // Canva integration is a stub (no active OAuth) — design_type is accepted
      // for forward-compat but currently ignored by the underlying helper.
      return canvaUploadSvgAndCreateDesign(svg, name);
    }
    case "save_to_drive": {
      const { filename, content, mimeType = "text/plain" } = input;
      // Text / markdown / HTML content → convert to native Google Doc (readable)
      // Binary or CSV → keep as raw file
      const isDocContent = ["text/plain", "text/markdown", "text/html", "application/json"].includes(mimeType)
        || mimeType.startsWith("text/");
      if (isDocContent) {
        // Wrap plain text / markdown in minimal HTML so Drive renders it properly.
        // Escape order matters: & MUST be replaced first, otherwise we'd
        // double-escape the &lt; / &gt; we're about to insert.
        const escaped = content
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
        const htmlBody = mimeType === "text/html"
          ? content
          : `<html><body style="font-family:Arial,sans-serif;font-size:14px;line-height:1.7;max-width:800px;margin:40px auto;direction:rtl;text-align:right"><pre style="white-space:pre-wrap;font-family:inherit">${escaped}</pre></body></html>`;
        return driveUploadAsGoogleDoc(filename, htmlBody);
      }
      return driveUploadText(filename, content, mimeType);
    }
    case "analyze_landing_page": {
      const { url, focus = "all" } = input;
      let pageText = "";
      try {
        const r = await fetch(url, { headers: { "User-Agent": "QoyodCreativeAgent/1.0" } });
        if (!r.ok) return { error: `fetch ${r.status}`, url };
        const html = await r.text();
        /* Strip scripts/styles/tags so we feed Claude readable prose */
        pageText = html
          .replace(/<script[\s\S]*?<\/script>/gi, " ")
          .replace(/<style[\s\S]*?<\/style>/gi, " ")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 8000);
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e), url };
      }
      const sys = `You are Qoyod's senior growth analyst. Critique landing pages like a conversion-focused marketer. Arabic pages: flag any non-Saudi dialect. Focus: ${focus}.`;
      const usr = `URL: ${url}\n\nPage text (truncated):\n${pageText}\n\nReturn JSON: {"headline_clarity":"...","value_prop":"...","cta":"...","trust":"...","mobile":"...","risks":["..."],"fixes":["..."],"score":0-100}`;
      const text = await claudeText(sys, usr, 2000);
      return safeJSON(text) ?? { raw: text, url };
    }
    case "translate_copy": {
      const { text, to, register = "ad" } = input;
      const sys =
        to === "ar"
          ? `Translate to Saudi-dialect Arabic (مو/وش/ليش — NEVER Egyptian مش/ايه). Preserve Qoyod brand voice. Register: ${register}.`
          : `Translate to clean business English. Preserve Qoyod brand voice. Register: ${register}.`;
      const out = await claudeText(sys, `Translate:\n${text}`, 1500);
      return { translated: out };
    }
    case "generate_video_script": {
      const { product, hook = "", duration_sec = 30, channel, cta = "ابدأ مجاناً" } = input;
      const sys = `You write short-form video scripts for Qoyod. Saudi dialect. Hook in first 1.5s. Scene-by-scene with Arabic VO, on-screen Arabic text, camera direction. Output JSON only.`;
      const usr = `Product: ${product}. Channel: ${channel}. Duration: ${duration_sec}s. Hook angle: ${hook}. CTA: ${cta}.
JSON: {"total_sec":${duration_sec},"scenes":[{"t":"0-3s","vo":"...","on_screen":"...","camera":"...","broll":"..."}],"cta":"...","caption":"..."}`;
      const t = await claudeText(sys, usr, 1800);
      return safeJSON(t) ?? { raw: t };
    }
    case "generate_seo_meta": {
      const { topic, product = "Qoyod", language = "ar" } = input;
      const sys = `Qoyod SEO specialist. Output JSON only. Language: ${language}.`;
      const usr = `Topic: ${topic}. Product: ${product}.
JSON: {"title":"...","meta_description":"...","og_title":"...","og_description":"...","keywords":["..."],"slug":"..."}`;
      const t = await claudeText(sys, usr, 900);
      return safeJSON(t) ?? { raw: t };
    }
    case "plan_ab_test": {
      const { hypothesis, surface, variants = 2 } = input;
      const sys = `You are Qoyod's growth experimentation lead. Output JSON only.`;
      const usr = `Hypothesis: ${hypothesis}
Surface: ${surface}
Variants: ${variants}
JSON: {"hypothesis":"...","surface":"...","variants":[{"id":"A","spec":"..."}],"primary_metric":"...","secondary":["..."],"min_sample_size":1000,"kill_criteria":"...","duration_days":14}`;
      const t = await claudeText(sys, usr, 1500);
      return safeJSON(t) ?? { raw: t };
    }
    case "generate_hashtags": {
      const { topic, channel = "Instagram" } = input;
      const sys = `You are a Gulf-market social strategist. Return JSON only.`;
      const usr = `Suggest 8-15 hashtags for "${topic}" on ${channel}. Mix Arabic + English. JSON: {"hashtags":["#..."]}`;
      const t = await claudeText(sys, usr, 400);
      return safeJSON(t) ?? { raw: t };
    }
    case "brief_to_spec": {
      const { brief } = input;
      const sys = `Expand a 1-line marketing brief into a complete spec. Output JSON only.`;
      const usr = `Brief: ${brief}
JSON: {"goal":"...","audience":"...","primary_message":"...","secondary_messages":["..."],"channels":["..."],"assets_needed":["..."],"kpis":["..."],"funnel_stage":"TOF|MOF|BOF","timeline":"...","suggested_next_tools":["..."]}`;
      const t = await claudeText(sys, usr, 1500);
      return safeJSON(t) ?? { raw: t };
    }
    case "generate_miro_board": {
      const { name, description = "" } = input;
      const r = await fetch(`http://127.0.0.1:${process.env.PORT || 8080}/api/miro/create-board`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description }),
      });
      return r.json();
    }
    case "analyze_competitor_content": {
      const { competitor, channel = "general", goal = "content_gap" } = input;
      /* Attempt a public fetch when competitor looks like a URL, otherwise
         let Claude reason from what it knows about the brand. */
      let pageText = "";
      if (typeof competitor === "string" && /^https?:\/\//.test(competitor)) {
        try {
          const r = await fetch(competitor, {
            headers: { "User-Agent": "QoyodCreativeAgent/1.0" },
          });
          if (r.ok) {
            const html = await r.text();
            pageText = html
              .replace(/<script[\s\S]*?<\/script>/gi, " ")
              .replace(/<style[\s\S]*?<\/style>/gi, " ")
              .replace(/<[^>]+>/g, " ")
              .replace(/\s+/g, " ")
              .trim()
              .slice(0, 6000);
          }
        } catch {
          /* ignore — fall back to reasoning */
        }
      }
      const sys = `You analyze competitors for Qoyod (Saudi ZATCA cloud accounting). Output JSON only.`;
      const usr = `Competitor: ${competitor}
Channel: ${channel}
Goal: ${goal}
${pageText ? `\nPublic page text:\n${pageText}` : ""}
JSON: {"themes":["..."],"tone":"...","hooks_used":["..."],"posting_cadence":"...","gaps_for_qoyod":["..."],"steal_ideas":["..."]}`;
      const t = await claudeText(sys, usr, 2000);
      return safeJSON(t) ?? { raw: t };
    }
    case "generate_google_ads_rsa": {
      const { product, keywords = [], funnel = "MOF", landing_url = "", language = "bilingual" } = input;
      const sys = `You are a Google Ads specialist for Qoyod. Output JSON only. Hard limits: headlines ≤30 chars, descriptions ≤90 chars. Saudi-dialect Arabic, never Egyptian.`;
      const usr = `Product: ${product}. Funnel: ${funnel}. Target keywords: ${keywords.join(", ")}. Landing: ${landing_url}. Language: ${language}.
JSON: {"headlines":[{"text":"...","chars":N}],"descriptions":[{"text":"...","chars":N}],"paths":["path1","path2"],"final_url":"..."} — 15 headlines + 4 descriptions.`;
      const t = await claudeText(sys, usr, 2500);
      return safeJSON(t) ?? { raw: t };
    }
    case "build_blog_article": {
      const { topic, primary_keyword, secondary_keywords = [], language = "ar", word_count = 1500 } = input;
      const sys = `You write SEO blog articles for Qoyod. ${language === "ar" ? "Saudi dialect for tone, MSA for facts." : "Clear business English."} Output Markdown only.`;
      const usr = `Topic: ${topic}
Primary keyword: ${primary_keyword}
Secondary: ${secondary_keywords.join(", ")}
Target length: ~${word_count} words.
Structure: H1, 200-word intro (keyword in first 100 chars), 4-7 H2 sections, FAQ block (5 Q&As), internal-link suggestions as a trailing list.`;
      const md = await claudeText(sys, usr, 4500);
      return { markdown: md, word_count: md.split(/\s+/).length };
    }
    case "analyze_metrics_report": {
      const { metrics, context = "" } = input;
      const sys = `You are Qoyod's growth analyst. Headline the "so what" first. Output JSON only.`;
      const usr = `Context: ${context}
Metrics JSON:
${JSON.stringify(metrics).slice(0, 6000)}
Return: {"headline_insight":"...","signals":[{"metric":"...","direction":"up|down|flat","meaning":"..."}],"actions_14d":["...","...","..."],"open_question":"..."}`;
      const t = await claudeText(sys, usr, 2000);
      return safeJSON(t) ?? { raw: t };
    }
    case "build_press_release": {
      const { headline, body_points = [], quote_from = "CEO Qoyod", embargo_date = "" } = input;
      const sys = `You write bilingual (Arabic + English) press releases for Qoyod. Output JSON only.`;
      const usr = `Headline idea: ${headline}
Body points: ${body_points.join(" | ")}
Quote from: ${quote_from}
Embargo: ${embargo_date || "FOR IMMEDIATE RELEASE"}
JSON: {"ar":{"headline":"...","lede":"...","body":"...","quote":"...","boilerplate":"..."},"en":{"headline":"...","lede":"...","body":"...","quote":"...","boilerplate":"..."}}`;
      const t = await claudeText(sys, usr, 2500);
      return safeJSON(t) ?? { raw: t };
    }
    case "slack_post": {
      const { channel, text, thread_ts } = input;
      const token = process.env.SLACK_BOT_TOKEN;
      if (!token) return { error: "SLACK_BOT_TOKEN not set" };
      const r = await fetch("https://slack.com/api/chat.postMessage", {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ channel, text, thread_ts }),
      });
      const d: any = await r.json();
      if (!d.ok) return { error: d.error ?? "slack error", raw: d };
      return { ok: true, ts: d.ts, channel: d.channel };
    }
    case "create_asana_task": {
      const { project_gid, name, notes = "", assignee } = input;
      const token = process.env.ASANA_ACCESS_TOKEN;
      if (!token) return { error: "ASANA_ACCESS_TOKEN not set" };
      const r = await fetch("https://app.asana.com/api/1.0/tasks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          data: {
            projects: [project_gid],
            name,
            notes,
            ...(assignee ? { assignee } : {}),
          },
        }),
      });
      const d: any = await r.json();
      if (!r.ok) return { error: d.errors?.[0]?.message ?? `HTTP ${r.status}`, raw: d };
      return {
        ok: true,
        task_gid: d.data?.gid,
        url: d.data?.permalink_url,
      };
    }
    case "brand_fact_lookup": {
      const { topic } = input;
      return BRAND_FACTS[topic as keyof typeof BRAND_FACTS] ?? { error: "unknown topic" };
    }
    case "memory_write": {
      const personaId = ctx?.personaId ?? "orchestrator";
      const text = String(input?.text ?? "").slice(0, 240);
      if (!text) return { error: "text required" };
      const note = writeNote(personaId, text);
      return { saved: true, note_id: note.id, persona: personaId };
    }
    case "memory_read": {
      const personaId = ctx?.personaId ?? "orchestrator";
      return {
        persona: personaId,
        notes: readNotes(personaId, 10),
        recent_tasks: recentRecall(personaId, 5),
      };
    }

    /* ── Content Library ──────────────────────────────────────── */
    case "content_library_save": {
      const entry: ContentEntry = {
        id: String(input.id),
        type: input.type ?? "post",
        channel: input.channel,
        published_at: input.published_at,
        content_text: input.content_text,
        post_url: input.post_url,
        thumb_url: input.thumb_url,
        media_type: input.media_type,
        topic: input.topic,
        hashtags: Array.isArray(input.hashtags) ? input.hashtags : undefined,
        tone: input.tone,
        quality: input.quality,
        optimization: input.optimization,
        analyzed_at: new Date().toISOString(),
      };
      const saved = upsertEntry(entry);
      return { saved: true, id: saved.id, library_stats: libraryStats() };
    }

    case "content_library_read": {
      const { channel, topic, limit = 10 } = input;
      const entries = listEntries({ channel, topic, limit: Number(limit) });
      return { entries, count: entries.length, library_stats: libraryStats() };
    }

    /* ── Competitor Intelligence via Gemini Google Search ─────── */
    case "search_competitor_content": {
      const { topic, competitor, channel } = input;
      const geminiKey = process.env.GEMINI_API_KEY;
      if (!geminiKey) return { error: "GEMINI_API_KEY not set" };

      const competitorList = competitor
        ? String(competitor)
        : "Wafeq, Sahl, Dafater, Zid, Foodics";
      const channelNote = channel ? ` on ${channel}` : " on Instagram, Twitter/X, TikTok, and LinkedIn";

      const searchPrompt = [
        `Search for recent social media posts by Saudi accounting/fintech competitors (${competitorList}) about the topic: "${topic}"${channelNote}.`,
        `For each post found, extract: company name, channel, post text excerpt, engagement signals (likes/comments if visible), posting date, and URL.`,
        `Return ONLY valid JSON in this exact schema:`,
        `{"posts":[{"competitor":"...","channel":"...","text":"...","engagement":"...","date":"...","url":"..."}],"insights":"summary of patterns, hooks they use, and content gaps Qoyod can exploit"}`,
      ].join(" ");

      try {
        const r = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: searchPrompt }] }],
              tools: [{ googleSearch: {} }],
              generationConfig: { temperature: 0.2 },
            }),
          }
        );
        if (!r.ok) {
          const err = await r.text();
          return { error: `Gemini ${r.status}: ${err.slice(0, 300)}` };
        }
        const data: any = await r.json();
        const rawText: string =
          data.candidates?.[0]?.content?.parts
            ?.filter((p: any) => p.text)
            ?.map((p: any) => p.text as string)
            ?.join("") ?? "";

        const parsed = safeJSON(rawText);

        /* Persist competitor posts into the content library */
        if (parsed?.posts && Array.isArray(parsed.posts)) {
          const cposts: CompetitorPost[] = (parsed.posts as any[]).map((p) => ({
            competitor: String(p.competitor ?? "unknown"),
            channel: String(p.channel ?? channel ?? "social"),
            content_text: String(p.text ?? ""),
            post_url: p.url ? String(p.url) : undefined,
            fetched_at: new Date().toISOString(),
            engagement_hint: p.engagement ? String(p.engagement) : undefined,
          }));
          saveCompetitorPosts(cposts);
        }

        return parsed ?? { raw: rawText.slice(0, 2000) };
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
      }
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}

function safeJSON(text: string): any | null {
  try {
    const clean = text.replace(/```json\n?|\n?```/g, "").trim();
    const fi = clean.indexOf("{");
    const li = clean.lastIndexOf("}");
    if (fi === -1) {
      const fa = clean.indexOf("[");
      const la = clean.lastIndexOf("]");
      if (fa === -1) return null;
      return JSON.parse(clean.slice(fa, la + 1));
    }
    return JSON.parse(clean.slice(fi, li + 1));
  } catch {
    return null;
  }
}

/* ─────────────────────────────────────────────────────────────
   AGENT LOOP
   ───────────────────────────────────────────────────────────── */
async function runAgent(task: Task) {
  task.status = "thinking";

  /* Resolve persona — precedence:
       1. explicit context.persona (caller forced it)
       2. first @mention handle in title+body
       3. keyword dispatch from title+body
     Also strip @handles out of the body before Claude sees it so it
     doesn't echo them back. */
  const explicit = (task.trigger.context as any)?.persona as string | undefined;
  const rawText = `${task.trigger.title ?? ""} ${task.trigger.body ?? ""}`;
  const mentions = parseMentions(rawText);
  const personaId =
    task.persona ??
    ((explicit && (PERSONAS as any)[explicit])
      ? (explicit as PersonaId)
      : mentions.primary ??
        pickPersona(mentions.clean || rawText, explicit));
  task.persona = personaId;
  const persona = PERSONAS[personaId];
  const activeTools = personaTools(TOOLS, personaId);

  const log = taskLogger({
    task_id: task.id,
    persona: personaId,
    source: task.trigger.source,
  });
  log.info(
    { tools: activeTools.length, mentions: mentions.all, actors: mentions.actors },
    "agent.run.start",
  );

  pushStep(task, {
    kind: "think",
    message: `Persona: ${persona.label_en} (${personaId}) · ${activeTools.length} tools · from ${task.trigger.source}${
      task.trigger.actor ? ` (${task.trigger.actor})` : ""
    }${mentions.all.length > 1 ? ` · cc: ${mentions.all.slice(1).join(", ")}` : ""}`,
  });

  /* Build first user message from the trigger */
  const triggerText =
    [
      task.trigger.title && `Task: ${task.trigger.title}`,
      task.trigger.body && `Message: ${task.trigger.body}`,
      task.trigger.context &&
        Object.keys(task.trigger.context).length > 0 &&
        `Context: ${JSON.stringify(task.trigger.context)}`,
      `Source: ${task.trigger.source}${task.trigger.actor ? ` • ${task.trigger.actor}` : ""}`,
    ]
      .filter(Boolean)
      .join("\n\n") || "No trigger body.";

  const messages: any[] = [{ role: "user", content: triggerText }];

  for (let step = 0; step < MAX_AGENT_STEPS; step++) {
    let data: any;
    try {
      data = await callAnthropic({
        model: MODEL,
        max_tokens: 4096,
        system: [SYSTEM_PROMPT, persona.prompt, buildMemoryBlock(personaId)]
          .filter(Boolean)
          .join("\n\n"),
        tools: activeTools,
        messages,
      });
    } catch (e) {
      task.status = "error";
      task.error = e instanceof Error ? e.message : String(e);
      pushStep(task, { kind: "error", message: task.error });
      return;
    }

    const content = data.content ?? [];
    messages.push({ role: "assistant", content });

    const thinkText = extractText(content);
    if (thinkText) pushStep(task, { kind: "think", message: thinkText });

    const toolUses = content.filter((b: any) => b.type === "tool_use");
    if (toolUses.length === 0 || data.stop_reason === "end_turn") {
      task.status = "done";
      task.summary = thinkText || "Done.";
      pushStep(task, { kind: "finish", message: task.summary });
      addRecall({
        task_id: task.id,
        persona: personaId,
        title: task.trigger.title || task.trigger.body?.slice(0, 60) || "(untitled)",
        summary: task.summary.slice(0, 240),
      });
      log.info({ steps: task.steps.length }, "agent.run.done");
      await replyToSource(task);
      return;
    }

    task.status = "running";
    const toolResults: any[] = [];
    for (const tu of toolUses) {
      pushStep(task, { kind: "tool_use", tool: tu.name, input: tu.input });
      let output: unknown;
      /* Cache check — saves a fresh tool round-trip when a repeat run
         asks for the same deterministic output (review_copy, translate,
         RSA, etc.). User can bypass with context.skipCache=true. */
      const skipCache = Boolean((task.trigger.context as any)?.skipCache);
      const hit = cacheLookup(tu.name, tu.input, personaId, { skipCache });
      if (hit.hit) {
        output = hit.output;
        log.info(
          { tool: tu.name, age_ms: hit.age_ms },
          "agent.tool.cache_hit",
        );
        pushStep(task, {
          kind: "tool_result",
          tool: tu.name,
          output,
          message: `(cache hit · age ${Math.round((hit.age_ms ?? 0) / 1000)}s)`,
        });
        mergeOutputs(task, tu.name, output);
        toolResults.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: JSON.stringify(truncateForClaude(output)),
        });
        continue;
      }
      try {
        output = await runTool(tu.name, tu.input, { personaId });
        if (!(output && typeof output === "object" && "error" in (output as object))) {
          cacheStore(tu.name, tu.input, output, personaId);
        }
      } catch (e) {
        output = { error: e instanceof Error ? e.message : String(e) };
        log.error({ tool: tu.name, err: String(e) }, "agent.tool.error");
      }
      /* Thread outputs into task.outputs so UI can link them */
      mergeOutputs(task, tu.name, output);
      pushStep(task, { kind: "tool_result", tool: tu.name, output });
      toolResults.push({
        type: "tool_result",
        tool_use_id: tu.id,
        content: JSON.stringify(truncateForClaude(output)),
      });
    }

    messages.push({ role: "user", content: toolResults });
  }

  task.status = "done";
  pushStep(task, {
    kind: "finish",
    message: `Stopped after ${MAX_AGENT_STEPS} steps. Consider narrowing the request.`,
  });
  task.summary = task.summary ?? "Reached step cap.";
  await replyToSource(task);
}

/* ─────────────────────────────────────────────────────────────
   REPLY-BACK — post the agent's summary back to the source so the
   teammate who mentioned us sees what we did without opening the UI.
   Currently supports Slack channels (needs SLACK_BOT_TOKEN).
   ───────────────────────────────────────────────────────────── */
async function replyToSource(task: Task) {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) return;
  /* Reply ONLY for direct Slack mentions. Never for UI, webhook, poller, or scheduler. */
  const isSlackTrigger = task.trigger.source === "mention";
  if (!isSlackTrigger) return;
  const channel = task.trigger.channel;
  if (!channel) return;

  const linkLabels: Record<string, string> = {
    canva_edit_url:        "Canva",
    canva_view_url:        "Canva preview",
    wordpress_edit_url:    "WordPress",
    wordpress_preview_url: "WordPress preview",
    hubspot_edit_url:      "HubSpot",
    hubspot_preview_url:   "HubSpot preview",
    drive_link:            "Drive",
    nb_image_drive_link:   "Image",
    miro_board_url:        "Miro board",
  };

  const sections: string[] = [];
  if (task.trigger.title) sections.push(`*${task.trigger.title}*`);
  if (task.summary) sections.push(task.summary);

  const outs = task.outputs ?? {};
  const links = Object.entries(linkLabels)
    .filter(([k]) => typeof outs[k] === "string" && (outs[k] as string).length > 0)
    .map(([k, label]) => `${label}: ${outs[k]}`);
  if (links.length) sections.push("Links:\n" + links.join("\n"));

  const text = sections.join("\n\n").slice(0, 3500) || "Task complete.";

  try {
    await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        channel,
        text,
        thread_ts: (task.trigger.context as any)?.slack_ts,
      }),
    });
  } catch (e) {
    logger.warn({ err: String(e), task_id: task.id }, "slack reply failed");
  }
}

/* Pull any useful links/ids from tool outputs into task.outputs for quick UI access */
function mergeOutputs(task: Task, tool: string, output: unknown) {
  const o = output as Record<string, unknown> | undefined;
  if (!o) return;
  if (tool === "generate_ad_svg" && typeof o.svg === "string") {
    (task.outputs.svgs ??= [] as unknown[]) as unknown[];
    (task.outputs.svgs as unknown[]).push({
      svg: (o.svg as string).slice(0, 400) + "…",
      width: o.width,
      height: o.height,
    });
  }
  if (tool === "upload_canva") {
    if (o.edit_url) task.outputs.canva_edit_url = o.edit_url;
    if (o.view_url) task.outputs.canva_view_url = o.view_url;
  }
  if (tool === "publish_wordpress") {
    if (o.editUrl) task.outputs.wordpress_edit_url = o.editUrl;
    if (o.previewUrl) task.outputs.wordpress_preview_url = o.previewUrl;
  }
  if (tool === "publish_hubspot") {
    if (o.editUrl) task.outputs.hubspot_edit_url = o.editUrl;
    if (o.previewUrl) task.outputs.hubspot_preview_url = o.previewUrl;
  }
  if (tool === "save_to_drive" && o.link) task.outputs.drive_link = o.link;
  if ((tool === "generate_nb_image" || tool === "generate_openai_image") && o.drive_link)
    task.outputs.nb_image_drive_link = o.drive_link;
  if (tool === "generate_miro_board") {
    const board = o.board as { viewLink?: string } | undefined;
    const url = (o.viewLink as string) || (o.url as string) || board?.viewLink;
    if (url) task.outputs.miro_board_url = url;
  }
  if (tool === "analyze_landing_page") {
    (task.outputs.analyses ??= [] as unknown[]);
    (task.outputs.analyses as unknown[]).push(o);
  }
  if (tool === "brief_to_spec") task.outputs.spec = o;
  if (tool === "build_campaign_plan") task.outputs.campaign_plan = o;
  if (tool === "build_content_calendar") task.outputs.content_calendar = o;
  if (tool === "build_email_sequence") task.outputs.email_sequence = o;
  if (tool === "generate_video_script") task.outputs.video_script = o;
  if (tool === "plan_ab_test") task.outputs.ab_test = o;
  if (tool === "generate_seo_meta") task.outputs.seo_meta = o;
}

function truncateForClaude(output: unknown): unknown {
  /* Avoid sending 100kb SVGs or data-URLs back into Claude */
  if (output && typeof output === "object") {
    const clone: Record<string, unknown> = { ...(output as Record<string, unknown>) };
    for (const k of Object.keys(clone)) {
      const v = clone[k];
      if (typeof v === "string" && v.length > 1500) clone[k] = v.slice(0, 1500) + "…[truncated]";
    }
    return clone;
  }
  return output;
}

/* ─────────────────────────────────────────────────────────────
   TRIGGER ENDPOINTS
   ───────────────────────────────────────────────────────────── */

/* Spawn + kick off an agent task. Returns null when deduped. */
function spawnTask(
  trigger: Trigger,
  opts: { priority?: Task["priority"]; schedule_id?: string; persona?: PersonaId } = {},
): Task | null {
  if (isDuplicate(trigger)) {
    logger.info({ trigger_source: trigger.source }, "agent: duplicate trigger skipped");
    return null;
  }
  const task: Task = {
    id: newTaskId(),
    created_at: Date.now(),
    updated_at: Date.now(),
    trigger,
    status: "queued",
    steps: [],
    outputs: {},
    priority: opts.priority ?? "normal",
    schedule_id: opts.schedule_id,
    persona: opts.persona,
  };
  TASKS.set(task.id, task);
  trimTasks();
  persist();
  runAgent(task).catch((e) => {
    task.status = "error";
    task.error = e instanceof Error ? e.message : String(e);
    pushStep(task, { kind: "error", message: task.error });
    logger.error({ err: task.error, task_id: task.id }, "agent loop crashed");
  });
  return task;
}

/* Manual UI trigger */
router.post("/run", async (req, res) => {
  const { title, body, context, actor, priority, persona } = req.body ?? {};
  const task = spawnTask(
    { source: "ui", title, body, context, actor: actor ?? "ui" },
    { priority, persona: persona as PersonaId | undefined },
  );
  if (!task) return res.status(202).json({ deduped: true });
  res.json({ task_id: task.id, status: task.status, persona: task.persona });
});

/* Generic @mention ingestion — simple JSON shape */
router.post("/mention", async (req, res) => {
  const { actor, channel, text, context } = req.body ?? {};
  if (!text) return res.status(400).json({ error: "text required" });
  const task = spawnTask({ source: "mention", actor, channel, body: text, context });
  if (!task) return res.status(202).json({ deduped: true });
  res.json({ task_id: task.id, status: task.status });
});

/* Generic webhook ingress
   Supports three shapes auto-detected by payload:
     - Slack Events API        (team @mention in a channel)
     - HubSpot workflow webhook (contact/deal enrollment)
     - Asana task webhook      (task assigned to Creative Agent user)
   Anything else is passed through as "task" source with raw body. */
router.post("/webhook", async (req, res) => {
  /* Asana webhook registration handshake — the first POST has an empty body
     and an `X-Hook-Secret` header that must be echoed back verbatim. */
  const asanaSecret = req.headers["x-hook-secret"];
  if (asanaSecret && typeof asanaSecret === "string") {
    res.setHeader("X-Hook-Secret", asanaSecret);
    return res.status(200).end();
  }

  const p: any = req.body ?? {};
  let trigger: Trigger;

  if (p.type === "url_verification" && p.challenge) {
    /* Slack URL verification handshake */
    return res.status(200).json({ challenge: p.challenge });
  }

  if (p.event?.type === "app_mention" || p.event?.type === "message") {
    /* Slack app_mention — our primary trigger. Guard on team_id so a
       leaked webhook URL can't be abused by events from another workspace. */
    const expectedTeam = process.env.SLACK_TEAM_ID;
    if (expectedTeam && p.team_id && p.team_id !== expectedTeam) {
      logger.warn({ got: p.team_id, expected: expectedTeam }, "slack: team_id mismatch");
      return res.status(200).json({ ok: true, ignored: "wrong_team" });
    }
    /* Ignore bot-echoes so we don't mention ourselves into a loop. */
    if (p.event.bot_id || p.event.subtype === "bot_message") {
      return res.status(200).json({ ok: true, ignored: "bot_message" });
    }
    trigger = {
      source: "mention",
      actor: p.event.user,
      channel: p.event.channel,
      body: p.event.text,
      context: { slack_ts: p.event.ts, thread_ts: p.event.thread_ts, team: p.team_id },
    };
  } else if (p._zapier || p.zap_type) {
    /* ── Zapier webhook (Webhooks by Zapier action) ──────────────────
       All Zaps POST to /api/agent/webhook with a _zapier:true flag
       plus a zap_type that maps to the right persona + task body.
       Supported zap_type values:
         hs_new_lead        → email_lifecycle  (nurture sequence)
         hs_deal_stage      → content_creator  (stage-specific content)
         hs_form_submit     → cro              (LP variant brief)
         sheets_brief       → orchestrator     (generic content brief)
         calendly_booking   → content_creator  (prospect prep)
         linkedin_lead      → email_lifecycle  (nurture sequence)
         rss_competitor     → social_media     (competitor analysis)
         google_review      → pr_comms         (review response)
         typeform_brief     → orchestrator     (content brief)
         youtube_published      → social_media  (repurpose to social)
         social_media_published → social_media  (cross-platform repurpose)
    */
    const zap = p.zap_type ?? "generic";
    const personaMap: Record<string, string> = {
      hs_new_lead:       "email_lifecycle",
      hs_deal_stage:     "content_creator",
      hs_form_submit:    "content_creator",
      sheets_brief:      "orchestrator",
      calendly_booking:  "content_creator",
      linkedin_lead:     "email_lifecycle",
      rss_competitor:        "social_media",
      google_review:         "pr_comms",
      typeform_brief:        "orchestrator",
      youtube_published:     "social_media",
      social_media_published:"social_media",
    };
    const titleMap: Record<string, string> = {
      hs_new_lead:       `New lead: ${p.contact_name ?? p.email ?? "unknown"}`,
      hs_deal_stage:     `Deal stage: ${p.deal_name ?? ""} → ${p.stage ?? ""}`,
      hs_form_submit:    `Form submission: ${p.form_name ?? p.page_name ?? ""}`,
      sheets_brief:      `Content brief: ${p.title ?? p.brief ?? ""}`,
      calendly_booking:  `Demo booked: ${p.invitee_name ?? ""} — ${p.event_type ?? ""}`,
      linkedin_lead:     `LinkedIn lead: ${p.first_name ?? ""} ${p.last_name ?? ""}`,
      rss_competitor:    `Competitor post: ${p.title ?? p.feed_title ?? ""}`,
      google_review:     `New review (${p.rating ?? "?"}★): ${p.reviewer_name ?? ""}`,
      typeform_brief:         `Brief: ${p.title ?? p.form_name ?? ""}`,
      youtube_published:      `New video: ${p.video_title ?? ""}`,
      social_media_published: `Social post published: ${p.post_title ?? p.title ?? ""}`,
    };
    const bodyParts = Object.entries(p)
      .filter(([k]) => !["_zapier","zap_type"].includes(k))
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n");
    trigger = {
      source:  "webhook",
      actor:   `zapier:${zap}`,
      title:   titleMap[zap] ?? `Zapier: ${zap}`,
      body:    bodyParts,
      context: { zap_type: zap, persona: personaMap[zap] ?? undefined, raw: p },
    };
    // Log content briefs to Google Sheets for persistence
    if (zap === "sheets_brief" || zap === "typeform_brief") {
      sheetsAppendBrief({
        brief_id: `brief_${Date.now()}`,
        created_at: new Date().toISOString(),
        submitted_by: p.email ?? p.submitted_by ?? undefined,
        campaign_name: p.campaign_name ?? p.title ?? undefined,
        target_channel: p.channel ?? p.target_channel ?? undefined,
        tone: p.tone ?? undefined,
        topic: p.topic ?? p.brief ?? undefined,
        keywords: p.keywords ?? undefined,
        notes: p.notes ?? p.message ?? undefined,
        status: "received",
      }).catch((e: unknown) => req.log.warn({ err: String(e) }, "sheets brief log failed"));
    }
  } else if (Array.isArray(p) && p[0]?.subscriptionType) {
    /* HubSpot workflow webhook — array of events */
    const e = p[0];
    trigger = {
      source: "task",
      actor: "hubspot_workflow",
      title: `HubSpot ${e.subscriptionType}`,
      body: JSON.stringify(e),
      context: { portalId: e.portalId, objectId: e.objectId, event_type: e.subscriptionType },
    };
  } else if (Array.isArray(p.events) && p.events.length === 0) {
    /* Asana keep-alive ping — empty events[], nothing to process */
    return res.status(200).json({ ok: true, ignored: "empty_events" });
  } else if (Array.isArray(p.events) && p.events.length > 0) {
    /* Asana webhook — events[] with per-event resource.
       We pick the first task-related event; dedup handles burst bodies. */
    const taskEvent =
      p.events.find(
        (e: any) => e.resource?.resource_type === "task" && (e.action === "added" || e.action === "changed"),
      ) ?? p.events[0];
    trigger = {
      source: "task",
      actor: taskEvent?.user?.gid ?? "asana",
      title: taskEvent?.resource?.name ?? `Asana ${taskEvent?.action ?? "event"}`,
      body:
        taskEvent?.resource?.notes ??
        `Asana ${taskEvent?.action} on ${taskEvent?.resource?.resource_type} ${taskEvent?.resource?.gid}`,
      context: {
        task_gid: taskEvent?.resource?.gid,
        action: taskEvent?.action,
        parent_gid: taskEvent?.parent?.gid,
      },
    };
  } else if (p.object_kind === "note" || p.object_kind === "issue") {
    /* GitLab/GitHub issue webhook — bonus: treat issues assigned to the
       agent as task triggers. */
    trigger = {
      source: "task",
      actor: p.user?.username ?? "git",
      title: p.object_attributes?.title ?? p.issue?.title ?? "Issue",
      body: p.object_attributes?.description ?? p.issue?.body ?? "",
      context: { issue_id: p.object_attributes?.id ?? p.issue?.id },
    };
  } else {
    trigger = {
      source: "webhook",
      body: typeof p === "string" ? p : JSON.stringify(p).slice(0, 4000),
      context: { raw: true, headers_ua: req.headers["user-agent"] },
    };
  }

  const task = spawnTask(trigger);
  if (!task) return res.json({ ok: true, deduped: true });
  res.json({ ok: true, task_id: task.id });
});

/* ─────────────────────────────────────────────────────────────
   SCHEDULES — recurring / daily agent runs
   ───────────────────────────────────────────────────────────── */
router.get("/schedules", (_req, res) => {
  res.json({ schedules: listSchedules() });
});

router.post("/schedules", (req, res) => {
  const { name, cadence, trigger } = req.body ?? {};
  if (!name || !cadence || !trigger?.body) {
    return res.status(400).json({ error: "name, cadence, trigger.body required" });
  }
  const validCadence =
    (typeof cadence.every_minutes === "number" && cadence.every_minutes > 0) ||
    (typeof cadence.daily_at === "string" && /^\d{1,2}:\d{2}$/.test(cadence.daily_at));
  if (!validCadence) {
    return res
      .status(400)
      .json({ error: "cadence must be {every_minutes:N} or {daily_at:'HH:mm'}" });
  }
  const s = addSchedule({ name, cadence, trigger });
  res.json({ schedule: s });
});

router.patch("/schedules/:id", (req, res) => {
  const { active } = req.body ?? {};
  if (typeof active !== "boolean") return res.status(400).json({ error: "active boolean required" });
  const ok = toggleSchedule(req.params.id, active);
  if (!ok) return res.status(404).json({ error: "not found" });
  res.json({ ok: true });
});

router.delete("/schedules/:id", (req, res) => {
  const ok = deleteSchedule(req.params.id);
  if (!ok) return res.status(404).json({ error: "not found" });
  res.json({ ok: true });
});

/* Run a schedule's trigger immediately (testing aid) */
router.post("/schedules/:id/fire", (req, res) => {
  const s = listSchedules().find((x) => x.id === req.params.id);
  if (!s) return res.status(404).json({ error: "not found" });
  const task = spawnTask(
    {
      source: "task",
      actor: s.trigger.actor ?? "scheduler",
      title: s.trigger.title ?? s.name,
      body: s.trigger.body,
      context: { schedule_id: s.id, manual_fire: true },
    },
    { schedule_id: s.id },
  );
  if (!task) return res.status(202).json({ deduped: true });
  res.json({ task_id: task.id });
});

/* Personas catalog for the UI */
/* ─────────────────────────────────────────────────────────────
   MEMORY + CACHE admin endpoints — small CRUD for the facts store,
   visibility into the tool-cache ROI.
   ───────────────────────────────────────────────────────────── */
router.get("/memory", (req, res) => {
  const persona = typeof req.query.persona === "string" ? req.query.persona : undefined;
  res.json({
    facts: listFacts(),
    recall: recentRecall(persona, 20),
    notes: persona ? readNotes(persona, 20) : undefined,
  });
});
router.post("/memory/fact", (req, res) => {
  const { id, text, source } = req.body ?? {};
  if (!id || !text) return res.status(400).json({ error: "id and text required" });
  upsertFact(String(id), String(text), source ? String(source) : undefined);
  res.json({ ok: true });
});
router.delete("/memory/fact/:id", (req, res) => {
  const ok = deleteFact(req.params.id);
  res.json({ ok });
});
router.post("/memory/note", (req, res) => {
  const { persona, text } = req.body ?? {};
  if (!persona || !text) return res.status(400).json({ error: "persona and text required" });
  const note = writeNote(String(persona), String(text));
  res.json({ ok: true, note });
});
router.delete("/memory/note/:persona/:id", (req, res) => {
  const ok = deleteNote(req.params.persona, req.params.id);
  res.json({ ok });
});

router.get("/cache/stats", (_req, res) => res.json(cacheStats()));
router.post("/cache/clear", (_req, res) => {
  cacheClear();
  res.json({ ok: true });
});

router.get("/personas", (_req, res) => {
  res.json({
    personas: Object.values(PERSONAS).map((p) => ({
      id: p.id,
      label: p.label,
      label_en: p.label_en,
      tagline: p.tagline,
      tools: p.tools.length ? p.tools : TOOLS.map((t) => t.name),
    })),
  });
});

/* List + inspect tasks */
router.get("/tasks", (req, res) => {
  const { status, source, schedule_id, persona } = req.query;
  const list = [...TASKS.values()]
    .filter((t) => (status ? t.status === status : true))
    .filter((t) => (source ? t.trigger.source === source : true))
    .filter((t) => (schedule_id ? t.schedule_id === schedule_id : true))
    .filter((t) => (persona ? t.persona === persona : true))
    .sort((a, b) => b.created_at - a.created_at)
    .slice(0, 50)
    .map((t) => ({
      id: t.id,
      created_at: t.created_at,
      updated_at: t.updated_at,
      status: t.status,
      source: t.trigger.source,
      actor: t.trigger.actor,
      title: t.trigger.title ?? t.trigger.body?.slice(0, 80) ?? "",
      steps: t.steps.length,
      summary: t.summary,
      priority: t.priority,
      schedule_id: t.schedule_id,
      persona: t.persona,
    }));
  res.json({ tasks: list });
});

router.get("/tasks/:id", (req, res) => {
  const t = TASKS.get(req.params.id);
  if (!t) return res.status(404).json({ error: "Task not found" });
  res.json(t);
});

router.delete("/tasks/:id", (req, res) => {
  const existed = TASKS.delete(req.params.id);
  persist();
  res.json({ ok: existed });
});

/* Re-run an existing task — useful after tweaking a schedule's body or
   retrying a failed run. Bypasses dedup so it always executes. */
router.post("/tasks/:id/rerun", (req, res) => {
  const t = TASKS.get(req.params.id);
  if (!t) return res.status(404).json({ error: "Task not found" });
  /* Clear dedup by hashing a fresh suffix */
  const trigger = { ...t.trigger, body: (t.trigger.body ?? "") + `\n[rerun ${Date.now()}]` };
  const task = spawnTask(trigger, { priority: t.priority, schedule_id: t.schedule_id });
  if (!task) return res.status(202).json({ deduped: true });
  res.json({ task_id: task.id });
});

/* Agent status / health */
router.get("/status", (_req, res) => {
  const tasks = [...TASKS.values()];
  const by = (k: Task["status"]) => tasks.filter((t) => t.status === k).length;
  res.json({
    model: MODEL,
    tools: TOOLS.map((t) => t.name),
    tool_count: TOOLS.length,
    max_agent_steps: MAX_AGENT_STEPS,
    dedup_window_ms: DEDUP_WINDOW_MS,
    tasks_in_memory: TASKS.size,
    task_cap: TASK_CAP,
    task_counts: {
      queued: by("queued"),
      thinking: by("thinking"),
      running: by("running"),
      done: by("done"),
      error: by("error"),
    },
    schedules: listSchedules().length,
    personas: Object.keys(PERSONAS).length,
    configured: {
      anthropic: !!process.env.ANTHROPIC_API_KEY,
      gemini: !!process.env.GEMINI_API_KEY,
      drive: !!(
        process.env.GOOGLE_SERVICE_ACCOUNT_B64 ||
        process.env.GOOGLE_SERVICE_ACCOUNT_JSON ||
        process.env.GOOGLE_APPLICATION_CREDENTIALS
      ),
      canva: !!(process.env.CANVA_CLIENT_ID && process.env.CANVA_CLIENT_SECRET),
      miro: !!(process.env.MIRO_CLIENT_ID || process.env.MIRO_ACCESS_TOKEN),
      wordpress: !!(process.env.WP_SITE_URL && process.env.WP_APP_PASSWORD),
      hubspot: !!process.env.HS_ACCESS_TOKEN,
      slack_reply: !!process.env.SLACK_BOT_TOKEN,
    },
  });
});

/* ─────────────────────────────────────────────────────────────
   Scheduler wiring — fire schedules into spawnTask() on their cadence
   ───────────────────────────────────────────────────────────── */
startScheduler((s: Schedule) => {
  spawnTask(
    {
      source: "task",
      actor: s.trigger.actor ?? "scheduler",
      title: s.trigger.title ?? s.name,
      body: s.trigger.body,
      context: { schedule_id: s.id, schedule_name: s.name },
    },
    { schedule_id: s.id },
  );
});

/* ── Social poller: manual trigger ──────────────────────────── */
router.post("/social/poll-now", async (_req, res) => {
  try {
    const { pollNow } = await import("../lib/hubspot-social-poller.js");
    await pollNow();
    res.json({ ok: true, message: "Poll completed" });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

/* ── Competitor poller: manual trigger ───────────────────────── */
router.post("/competitor/poll-now", async (_req, res) => {
  try {
    const { pollCompetitorNow } = await import("../lib/competitor-poller.js");
    await pollCompetitorNow();
    res.json({ ok: true, message: "Competitor scrape completed" });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

/* ── Content library stats ────────────────────────────────────── */
router.get("/content-library/stats", (_req, res) => {
  res.json(libraryStats());
});

/* ── Weekly digest: manual trigger ────────────────────────────── */
router.post("/weekly-digest/run-now", async (_req, res) => {
  try {
    const { runDigestNow } = await import("../lib/weekly-digest.js");
    const out = await runDigestNow();
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/daily-digest/run-now", async (_req, res) => {
  try {
    const { runDailyDigest } = await import("../lib/daily-digest.js");
    const out = await runDailyDigest();
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

/* ── Social posts — live from HubSpot broadcasts ── */

// Cache the channel label map + HubSpot portal ID
let _channelMapCache: Record<string, string> | null = null;
let _channelMapFetchedAt = 0;
let _portalId: number | null = null;

async function getPortalId(token: string): Promise<number | null> {
  if (_portalId) return _portalId;
  try {
    const r = await fetch("https://api.hubapi.com/account-info/v3/details", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return null;
    const d = await r.json() as { portalId?: number };
    _portalId = d.portalId ?? null;
    return _portalId;
  } catch { return null; }
}

async function getChannelMap(token: string): Promise<Record<string, string>> {
  const now = Date.now();
  if (_channelMapCache && now - _channelMapFetchedAt < 60 * 60 * 1_000) return _channelMapCache;
  try {
    const r = await fetch("https://api.hubapi.com/broadcast/v1/channels/setting/publish/current", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) throw new Error(`channels API ${r.status}`);
    const data = await r.json() as Array<{ channelKey: string; channelType?: string; name?: string }>;
    const map: Record<string, string> = {};
    for (const ch of (Array.isArray(data) ? data : [])) {
      // Derive a friendly label: prefer name, fall back to channelType
      const raw   = ch.name || ch.channelType || ch.channelKey || "";
      const lower = raw.toLowerCase();
      let label = raw;
      if (lower.includes("instagram"))  label = "Instagram";
      else if (lower.includes("facebook")) label = "Facebook";
      else if (lower.includes("linkedin")) label = "LinkedIn";
      else if (lower.includes("tiktok"))   label = "TikTok";
      else if (lower.includes("twitter") || lower.includes("/x")) label = "Twitter/X";
      else if (lower.includes("youtube"))  label = "YouTube";
      if (ch.channelKey) map[ch.channelKey] = label;
    }
    _channelMapCache = map;
    _channelMapFetchedAt = now;
    return map;
  } catch {
    // Fall back to empty map — channelKey prefix will be used as label
    return _channelMapCache ?? {};
  }
}

function resolveChannel(channelKey: string, map: Record<string, string>): string {
  // Exact match first
  if (map[channelKey]) return map[channelKey];
  // Partial key match (HubSpot sometimes appends account IDs)
  for (const [k, v] of Object.entries(map)) {
    if (channelKey.includes(k) || k.includes(channelKey)) return v;
  }
  // Infer from the key string itself
  const low = channelKey.toLowerCase();
  if (low.includes("instagram"))  return "Instagram";
  if (low.includes("facebook"))   return "Facebook";
  if (low.includes("linkedin"))   return "LinkedIn";
  if (low.includes("tiktok"))     return "TikTok";
  if (low.includes("twitter"))    return "Twitter/X";
  if (low.includes("youtube"))    return "YouTube";
  return channelKey.split(":")[0] ?? channelKey;
}

router.get("/social-posts", async (req, res) => {
  const token = process.env.HS_ACCESS_TOKEN;
  if (!token) return res.status(503).json({ error: "HubSpot not configured" });
  try {
    const limit = Math.min(Number(req.query.limit) || 40, 50);
    const [broadcastRes, channelMap] = await Promise.all([
      fetch(`https://api.hubapi.com/broadcast/v1/broadcasts?status=SUCCESS&limit=${limit}`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
      getChannelMap(token),
    ]);
    if (!broadcastRes.ok) return res.status(broadcastRes.status).json({ error: await broadcastRes.text() });
    const data = await broadcastRes.json() as Array<{
      broadcastGuid: string; channelKey: string; finishedAt: number;
      status: string; messageUrl?: string;
      content?: { body?: string; title?: string; thumbUrl?: string };
      statistics?: { clicks?: number; impressions?: number; reach?: number; reactions?: number; shares?: number };
    }>;

    const posts = (Array.isArray(data) ? data : []).map((b) => ({
      id:           b.broadcastGuid,
      channel:      resolveChannel(b.channelKey, channelMap),
      channelKey:   b.channelKey,
      published_at: b.finishedAt ? new Date(b.finishedAt).toISOString() : null,
      content:      b.content?.body || b.content?.title || "",
      url:          b.messageUrl || null,
      thumb:        b.content?.thumbUrl || null,
      stats: {
        clicks:      b.statistics?.clicks      ?? null,
        impressions: b.statistics?.impressions ?? null,
        reach:       b.statistics?.reach       ?? null,
        reactions:   b.statistics?.reactions   ?? null,
        shares:      b.statistics?.shares      ?? null,
      },
    }));
    res.json({ posts, total: posts.length });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.get("/content-library/entries", (_req, res) => {
  try {
    const { type, channel, limit } = _req.query;
    const entries = listEntries({
      type: type as import("../lib/content-library.js").ContentEntry["type"],
      channel: channel as string,
      limit: Number(limit) || 30,
    });
    res.json({ entries });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.get("/email-campaigns", async (_req, res) => {
  const token = process.env.HS_ACCESS_TOKEN;
  if (!token) return res.status(503).json({ error: "HubSpot not configured" });
  try {
    const portalId = await getPortalId(token);
    // Request specific properties — v3 returns only id/name/subject by default
    const props = [
      "hs_email_status","state","publishDate","scheduledAt","updatedAt",
      "hs_email_sends_requested","hs_email_delivered","hs_email_open",
      "hs_email_click","hs_email_bounce","hs_email_unsubscribed",
      "hs_email_subject","archived",
    ].join(",");
    const r = await fetch(
      `https://api.hubapi.com/marketing/v3/emails?limit=50&sort=-updatedAt&properties=${props}`,
      { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } }
    );
    const data = await r.json() as { results?: Record<string, unknown>[]; message?: string };
    if (!r.ok) return res.status(r.status).json({ error: data.message || "HubSpot error" });
    const now = Date.now();
    const cutoff2026 = new Date("2026-01-01").getTime();
    const slim = (data.results || [])
      .map((e) => {
        const props = (e.properties || e) as Record<string, unknown>;
        const state      = (props.hs_email_status || props.state || "") as string;
        const publishDate= (props.publishDate || props.updatedAt || "") as string;
        const dateMs     = publishDate ? new Date(publishDate).getTime() : 0;
        const name       = (e.name || props.name || "") as string;
        return { id: e.id, name, subject: (e.subject || props.hs_email_subject || "") as string,
          state, publishDate, scheduledAt: (props.scheduledAt || "") as string,
          archived: props.archived,
          stats: {
            sent:         Number(props.hs_email_sends_requested) || 0,
            delivered:    Number(props.hs_email_delivered)       || 0,
            opens:        Number(props.hs_email_open)            || 0,
            clicks:       Number(props.hs_email_click)           || 0,
            bounces:      Number(props.hs_email_bounce)          || 0,
            unsubscribes: Number(props.hs_email_unsubscribed)    || 0,
          },
          _dateMs: dateMs,
        };
      })
      .filter((e) => {
        if (e.archived) return false;
        // Only 2026+
        if (e._dateMs > 0 && e._dateMs < cutoff2026) return false;
        // Only show published/live/scheduled — exclude drafts, losers, archived
        const s = e.state.toUpperCase();
        const keep = ["PUBLISHED","SCHEDULED","SENDING","AUTOMATED","AUTOMATED_AB"];
        if (!s || !keep.includes(s)) return false;
        // Exclude test emails
        const n = e.name.toLowerCase();
        if (n.includes("test") || n.includes("تجربة") || n.includes("اختبار")) return false;
        return true;
      })
      .map(({ _dateMs: _, ...rest }) => ({
        ...rest,
        viewUrl: portalId ? `https://app.hubspot.com/email/${portalId}/details/${rest.id}/performance` : null,
      }));
    res.json({ results: slim, total: slim.length });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.get("/daily-summary", async (_req, res) => {
  try {
    const { readLatestDigest } = await import("../lib/daily-digest.js");
    const data = readLatestDigest();
    if (!data) return res.status(404).json({ error: "No digest yet" });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

export default router;
