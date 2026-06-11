/**
 * Daily Competitor Capture — runs at 07:00 UTC
 * Scrapes last 24h of competitor Instagram posts, identifies weaknesses,
 * generates 2 Qoyod counter-content pieces, saves to Google Drive.
 */
import { logger } from "./logger.js";
import { driveUploadAsGoogleDoc } from "../routes/drive.js";
import { sheetsLogDocument, sheetsLogICPSignal } from "./sheets-client.js";
import { invalidateICPCache } from "./icp-context.js";
import { callClaude } from "./ai-call.js";

const COMPETITORS = [
  { name: "Daftra",   ig: "daftraonline" },
  { name: "Rewaa",    ig: "rewaatech"    },
  { name: "Wafeq",    ig: "wafeq.app"   },
  { name: "Smacc",    ig: null           },
  { name: "Dafater",  ig: null           },
];

interface CapturedPost {
  competitor: string;
  platform: string;
  text: string;
  url: string;
  postedAt: string;
}

async function scrapeInstagramLast24h(apifyToken: string): Promise<CapturedPost[]> {
  const posts: CapturedPost[] = [];

  for (const comp of COMPETITORS) {
    if (!comp.ig) continue;
    try {
      const url = `https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items?token=${encodeURIComponent(apifyToken)}&timeout=90`;
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          directUrls: [`https://www.instagram.com/${comp.ig}/`],
          resultsType: "posts",
          resultsLimit: 5,
          addParentData: false,
        }),
        signal: AbortSignal.timeout(100_000),
      });
      if (!r.ok) continue;
      const items = (await r.json()) as any[];
      const since = Date.now() - 24 * 60 * 60 * 1000;
      for (const p of Array.isArray(items) ? items : []) {
        const ts = p.timestamp ? new Date(p.timestamp).getTime() : 0;
        if (ts > 0 && ts < since) continue;
        const text = p.caption || p.alt || "";
        if (text.length < 10) continue;
        posts.push({
          competitor: comp.name,
          platform: "Instagram",
          text,
          url: p.url ?? `https://www.instagram.com/p/${p.shortCode ?? ""}/`,
          postedAt: p.timestamp ?? "",
        });
      }
    } catch (e) {
      logger.warn({ competitor: comp.name, err: String(e) }, "daily-capture: instagram scrape failed");
    }
  }
  return posts;
}

async function analyseAndCounter(posts: CapturedPost[]): Promise<string> {
  if (posts.length === 0) return "لم يتم رصد منشورات جديدة من المنافسين في آخر 24 ساعة.";

  const postsText = posts
    .slice(0, 10)
    .map((p, i) => `[${i + 1}] ${p.competitor} على ${p.platform}:\n${p.text.slice(0, 350)}\n${p.url}`)
    .join("\n\n---\n\n");

  const system = `أنت محلل ميديا مدفوعة متخصص في قيود (برنامج محاسبة سعودي).
اللهجة: سعودية خالصة. بدون إيموجي. بدون مبالغة.
قواعد صارمة: رسالة واحدة، CTA واحدة، عنصر ثقة واحد في كل منشور.`;

  const user = `إليك منشورات المنافسين من آخر 24 ساعة:

${postsText}

اكتب ما يلي بالعربية بشكل طبيعي وبشري:
1. نقاط الضعف: أبرز 3 نقاط ضعف في محتوى المنافسين (وعود مبالغ فيها، غياب ZATCA، لغة غير واضحة)
2. منشور مضاد #1: منشور إنستغرام باللهجة السعودية يستغل أكبر نقطة ضعف (max 150 كلمة، بدون عناوين)
3. منشور مضاد #2: تغريدة أو منشور لينكدإن يبرز ميزة قيود الفريدة (max 100 كلمة، نبرة احترافية)

اكتب مباشرة بدون أقسام أو رؤوس مزخرفة.`;

  try {
    // callClaude always tries to parse JSON — use a raw call instead
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return "ANTHROPIC_API_KEY not set.";
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5",
        max_tokens: 1500,
        system,
        messages: [{ role: "user", content: user }],
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!r.ok) return `AI call failed: ${r.status}`;
    const data = (await r.json()) as any;
    return data.content?.[0]?.text ?? "لم يتمكن النظام من إنشاء التحليل.";
  } catch (e) {
    return `Error: ${String(e)}`;
  }
}

// ICP archetype list sent to AI so it can tag each post
const ICP_LIST = [
  "P01=CFO/مدير مالي", "P02=مؤسس/CEO شركة صغيرة", "P03=مدير مالي",
  "P04=صاحب متجر إلكتروني", "P05=مدير العمليات", "P06=محاسب/مسك دفاتر",
  "P07=صاحب محل تجزئة", "P08=مستشار ضريبي", "P09=مستشار أعمال للـ SMEs",
  "P10=مؤسس شركة ناشئة",
].join(", ");

const ICP_TITLE_MAP: Record<string, string> = {
  P01:"CFO / مدير مالي", P02:"مؤسس / CEO — شركة صغيرة", P03:"مدير مالي",
  P04:"صاحب متجر إلكتروني", P05:"مدير العمليات", P06:"محاسب / مسك دفاتر",
  P07:"صاحب محل تجزئة", P08:"مستشار ضريبي", P09:"مستشار أعمال للـ SMEs",
  P10:"مؤسس شركة ناشئة",
};

async function extractICPSignals(posts: CapturedPost[], date: string): Promise<void> {
  if (posts.length === 0) return;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return;

  const postsText = posts.slice(0, 10).map((p, i) =>
    `[${i + 1}] ${p.competitor} | ${p.platform} | ${p.text.slice(0, 200)}`
  ).join("\n\n");

  const system = `You are an ICP analyst. For each competitor post, identify which customer archetype it targets.
ICP list: ${ICP_LIST}.
Return ONLY a valid JSON array — no markdown, no explanation.
Schema: [{"icp_id":"P07","competitor":"Rewaa","pain_hook":"مخزون لحظي","channel":"Instagram","post_snippet":"first 100 chars of post"}]
If a post targets multiple ICPs, emit one object per ICP. If unclear, use the closest match.`;

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5",
        max_tokens: 1000,
        system,
        messages: [{ role: "user", content: postsText }],
      }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!r.ok) return;
    const data = (await r.json()) as any;
    const raw = data.content?.[0]?.text ?? "";
    const fi = raw.indexOf("[");
    const li = raw.lastIndexOf("]");
    if (fi === -1 || li === -1) return;
    const signals: any[] = JSON.parse(raw.slice(fi, li + 1));

    let saved = 0;
    for (const s of signals) {
      if (!s.icp_id || !ICP_TITLE_MAP[s.icp_id]) continue;
      await sheetsLogICPSignal({
        date,
        icp_id: s.icp_id,
        icp_title: ICP_TITLE_MAP[s.icp_id],
        competitor: s.competitor || "",
        pain_hook: (s.pain_hook || "").slice(0, 120),
        channel: s.channel || "Instagram",
        post_snippet: (s.post_snippet || "").slice(0, 120),
      }).catch(() => {});
      saved++;
    }
    if (saved > 0) {
      invalidateICPCache();
      logger.info({ saved }, "daily-capture: ICP signals logged");
    }
  } catch (e) {
    logger.warn({ err: String(e) }, "daily-capture: ICP extraction failed (non-fatal)");
  }
}

export async function runDailyCompetitorCapture(): Promise<{ ok: boolean; saved?: string; error?: string }> {
  logger.info("daily-capture: starting");
  try {
    const token = process.env.APIFY_TOKEN;
    if (!token) {
      logger.warn("daily-capture: APIFY_TOKEN not set, skipping scrape");
      return { ok: false, error: "APIFY_TOKEN not set" };
    }

    const posts = await scrapeInstagramLast24h(token);
    logger.info({ count: posts.length }, "daily-capture: scraped posts");

    const date = new Date().toISOString().slice(0, 10);

    // Run content analysis + ICP extraction in parallel
    const [analysis] = await Promise.all([
      analyseAndCounter(posts),
      extractICPSignals(posts, date),
    ]);
    const title = `Daily Competitor Capture — ${date}`;
    const docResult = await driveUploadAsGoogleDoc(title, analysis, "Competitor Intel");
    if (docResult.link) {
      sheetsLogDocument({ date, type: "Competitor Intel", title, link: docResult.link }).catch(() => {});
    }
    logger.info({ link: docResult.link }, "daily-capture: saved to Drive");
    return { ok: true, saved: docResult.link ?? "" };
  } catch (err) {
    logger.error({ err: String(err) }, "daily-capture: failed");
    return { ok: false, error: String(err) };
  }
}
