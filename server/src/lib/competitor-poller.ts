/**
 * Competitor Social Poller
 *
 * Runs every 6 hours, fetches recent public posts from Qoyod's Saudi
 * accounting/fintech competitors (Wafeq, Sahl, Dafater, Zid, Foodics)
 * on Instagram, TikTok, and Twitter/X using Gemini + Google Search grounding.
 *
 * Results are saved directly into data/content-library.json (competitor_posts).
 * No agent task is spawned — this is a background intelligence feed.
 */

import { logger } from "./logger.js";
import { saveCompetitorPosts, type CompetitorPost } from "./content-library.js";

const POLL_INTERVAL_MS = 6 * 60 * 60 * 1_000; // 6 hours

/* ── Competitor registry ─────────────────────────────────────── */
interface Competitor {
  name: string;
  instagram?: string;
  twitter?: string;
  tiktok?: string;
  linkedin?: string;
  website: string;
}

const COMPETITORS: Competitor[] = [
  {
    name: "Wafeq",
    instagram: "wafeq",
    twitter: "wafeqapp",
    tiktok: "wafeqapp",
    linkedin: "wafeq",
    website: "wafeq.com",
  },
  {
    name: "Sahl",
    instagram: "sahlapp",
    twitter: "sahlapp",
    tiktok: "sahlapp",
    linkedin: "sahl-io",
    website: "sahl.io",
  },
  {
    name: "Dafater",
    instagram: "dafater_sa",
    twitter: "dafater",
    tiktok: "dafater",
    linkedin: "dafater",
    website: "dafater.com",
  },
  {
    name: "Zid",
    instagram: "zid_sa",
    twitter: "zid_sa",
    tiktok: "zid_sa",
    linkedin: "zid-sa",
    website: "zid.store",
  },
  {
    name: "Foodics",
    instagram: "foodicshq",
    twitter: "foodicshq",
    tiktok: "foodicshq",
    linkedin: "foodics",
    website: "foodics.com",
  },
];

/* ── Gemini search helper ────────────────────────────────────── */
async function searchCompetitorPosts(
  competitor: Competitor,
  channel: "Instagram" | "Twitter/X" | "TikTok",
  geminiKey: string
): Promise<CompetitorPost[]> {
  const handle = channel === "Instagram"
    ? competitor.instagram
    : channel === "Twitter/X"
    ? competitor.twitter
    : competitor.tiktok;

  if (!handle) return [];

  const siteMap: Record<string, string> = {
    Instagram: "instagram.com",
    "Twitter/X": "twitter.com OR x.com",
    TikTok: "tiktok.com",
  };

  const prompt = [
    `Find the 3 most recent public social media posts from ${competitor.name}'s official ${channel} account (handle: @${handle}, site: ${siteMap[channel]}).`,
    `Rules for the "text" field:`,
    `- Include ONLY the actual caption/post body the account wrote.`,
    `- Do NOT include: website URLs, CTAs like "ابدأ الاستخدام مجانًا" or "تواصل معنا", contact links, social media profile links, or any boilerplate appended by the platform.`,
    `- If the post is a video/reel, use the video description/caption only.`,
    `- Maximum 300 characters per post text.`,
    `For each post return: text, date (ISO), url (direct post link), engagement (likes+comments count if visible or empty string).`,
    `Return ONLY valid JSON with no markdown: {"posts":[{"text":"...","date":"...","url":"...","engagement":"..."}]}`,
  ].join(" ");

  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          tools: [{ googleSearch: {} }],
          generationConfig: { temperature: 0.1 },
        }),
      }
    );

    if (!r.ok) {
      const err = await r.text();
      logger.warn({ competitor: competitor.name, channel, status: r.status, err: err.slice(0, 200) }, "competitor-poller: Gemini error");
      return [];
    }

    const data: any = await r.json();
    const rawText: string =
      data.candidates?.[0]?.content?.parts
        ?.filter((p: any) => p.text)
        ?.map((p: any) => p.text as string)
        ?.join("") ?? "";

    /* Safe JSON parse */
    let parsed: any = null;
    try {
      const clean = rawText.replace(/```json\n?|\n?```/g, "").trim();
      const fi = clean.indexOf("{");
      const li = clean.lastIndexOf("}");
      if (fi !== -1 && li !== -1) parsed = JSON.parse(clean.slice(fi, li + 1));
    } catch {
      /* ignore */
    }

    if (!parsed?.posts || !Array.isArray(parsed.posts)) return [];

    return (parsed.posts as any[]).map((p) => ({
      competitor: competitor.name,
      channel,
      content_text: String(p.text ?? ""),
      post_url: p.url ? String(p.url) : undefined,
      fetched_at: new Date().toISOString(),
      engagement_hint: p.engagement ? String(p.engagement) : undefined,
    }));
  } catch (e) {
    logger.warn({ competitor: competitor.name, channel, err: String(e) }, "competitor-poller: fetch failed");
    return [];
  }
}

/* ── Qoyod content mapper ────────────────────────────────────── */
/**
 * Given a competitor post, generates a Qoyod-branded "lookalike" version
 * that targets the same audience/pain point in Qoyod's identity.
 * Uses Haiku (fast + cheap) for bulk generation.
 */
async function generateMappedContent(
  competitor: string,
  channel: string,
  contentText: string
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || contentText.trim().length < 20) return "";

  const maxWords = channel === "Twitter/X" ? 100 : 150;

  const systemPrompt = `أنت كاتب محتوى لـ قيود — برنامج محاسبة سحابي سعودي يدعم الفاتورة الإلكترونية (ZATCA).
قواعد صارمة لكل منشور:
- رسالة واحدة فقط. CTA واحدة. عنصر ثقة واحد (ZATCA أو عدد المستخدمين أو الدعم السعودي).
- اللهجة: سعودية خالصة. لا مصرية. لا فصحى مبالغ فيها.
- بدون إيموجي. بدون مبالغة. بدون كلام عام.
- max ${maxWords} كلمة.
- اكتب نص المنشور مباشرة — لا عنوان، لا شرح، فقط النص.`;

  const userPrompt = `منشور المنافس (${competitor} على ${channel}):\n${contentText.slice(0, 400)}\n\nاكتب نسخة قيود تستهدف نفس الجمهور ونفس الألم لكن بهوية قيود.`;

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 400,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!r.ok) return "";
    const data: any = await r.json();
    return (data?.content?.[0]?.text ?? "").trim();
  } catch {
    return "";
  }
}

/* ── Main poll cycle ─────────────────────────────────────────── */
async function poll() {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) {
    logger.warn("competitor-poller: GEMINI_API_KEY not set, skipping");
    return;
  }

  logger.info("competitor-poller: starting scrape cycle");

  const channels: Array<"Instagram" | "Twitter/X" | "TikTok"> = ["Instagram", "Twitter/X", "TikTok"];
  const allPosts: CompetitorPost[] = [];

  for (const competitor of COMPETITORS) {
    for (const channel of channels) {
      /* Stagger requests to avoid rate limits */
      await new Promise((r) => setTimeout(r, 2_000));

      const posts = await searchCompetitorPosts(competitor, channel, geminiKey);
      allPosts.push(...posts);
      logger.info(
        { competitor: competitor.name, channel, found: posts.length },
        "competitor-poller: scraped"
      );
    }
  }

  if (allPosts.length > 0) {
    // Generate Qoyod-branded lookalike version for each post before saving
    logger.info({ total: allPosts.length }, "competitor-poller: generating Qoyod-mapped versions");
    for (const post of allPosts) {
      await new Promise((r) => setTimeout(r, 300)); // stagger to avoid rate limits
      post.mapped_content = await generateMappedContent(post.competitor, post.channel, post.content_text);
    }
    saveCompetitorPosts(allPosts);
    logger.info({ total: allPosts.length }, "competitor-poller: saved posts with Qoyod versions to library");
  } else {
    logger.info("competitor-poller: no new posts found");
  }
}

/* ── Public API ──────────────────────────────────────────────── */
let handle: NodeJS.Timeout | null = null;

export function startCompetitorPoller() {
  if (handle) return;
  if (!process.env.GEMINI_API_KEY) {
    logger.warn("competitor-poller: GEMINI_API_KEY missing — competitor poller disabled");
    return;
  }

  /* First run after 2 min (let server stabilise), then every 6h */
  setTimeout(async () => {
    await poll().catch((e) => logger.error({ err: String(e) }, "competitor-poller: initial poll error"));
    handle = setInterval(() => {
      poll().catch((e) => logger.error({ err: String(e) }, "competitor-poller: poll error"));
    }, POLL_INTERVAL_MS);
    if (handle?.unref) handle.unref();
  }, 2 * 60 * 1_000);

  logger.info({ interval_hours: 6, competitors: COMPETITORS.length }, "competitor-poller: started");
}

export function stopCompetitorPoller() {
  if (handle) {
    clearInterval(handle);
    handle = null;
  }
}

/** Manual trigger for the /api/agent/competitor/poll-now endpoint */
export async function pollCompetitorNow() {
  return poll();
}
