/**
 * Social Listener — runs every 6 hours
 * Monitors X/Twitter and web for Qoyod brand + ZATCA/regulatory keywords.
 * Saves summary to data/listening-cache.json and optionally to Google Drive.
 */
import fs from "fs";
import path from "path";
import { logger } from "./logger.js";
import { sheetsAppendMentions, sheetsLogActivity } from "./sheets-client.js";

const CACHE_PATH = path.resolve(process.cwd(), "data", "listening-cache.json");

// Twitter/X is the primary source — all groups are scraped on X first.
// Web search is used only for zatca/market (regulatory news, not brand chatter).
interface GroupConfig {
  terms: string[];
  webSearch: boolean;
  linkedIn: boolean; // professional content — good for brand + regulatory
  tiktok: boolean;   // brand awareness only
  threads: boolean;  // brand awareness only
}

const KEYWORDS: Record<"brand" | "zatca" | "market", GroupConfig> = {
  brand:  {
    terms: ["qoyod", "برنامج قيود", "@qoyod", "qoyod.com"],
    webSearch: false, linkedIn: true, tiktok: true, threads: true,
  },
  zatca:  {
    terms: [
      "هيئة الزكاة والضريبة",
      "هيئة الزكاة والضريبة والجمارك",
      "ZATCA",
      "الفاتورة الالكترونية",
      "الفاتورة الالكترونية المرحلة الثانية",
      "المرحلة الثانية للفاتورة",
      "ربط الفاتورة الالكترونية",
      "رفع القوائم المالية",
      "منصة فاتورة",
      "fatoorah portal",
      "e-invoice phase 2",
      "فاتورة ضريبية",
      "#فاتورة_الكترونية",
      "فوترة إلكترونية",
    ],
    webSearch: true, linkedIn: true, tiktok: false, threads: false,
  },
  market: {
    terms: ["وزارة التجارة السعودية", "برنامج محاسبة", "نظام محاسبي", "فاتورة معتمدة", "#محاسبة_سعودية"],
    webSearch: true, linkedIn: true, tiktok: false, threads: false,
  },
};

export interface ListeningMention {
  keyword: string;
  group: "brand" | "zatca" | "market";
  platform: string;
  text: string;
  url: string;
  author?: string;
  postedAt?: string;
}

export interface ListeningResult {
  runAt: string;
  mentions: ListeningMention[];
  summary: string;
}

// Qoyod's own accounts — exclude from all scrapers so we capture what others say, not our own posts
const QOYOD_ACCOUNTS = new Set([
  "qoyod", "qoyodapp", "qoyod_sa", "qoyodsa", "qoyodofficial",
  "qoyod.com", "تطبيق قيود", "برنامج قيود",
]);
function isOwnAccount(author: string): boolean {
  const a = author.toLowerCase().replace(/^@/, "").trim();
  return QOYOD_ACCOUNTS.has(a) || a.startsWith("qoyod");
}

// ── DuckDuckGo via jina reader — no CAPTCHA, no API key needed ───────────────
async function ddgSearch(query: string): Promise<Array<{ url: string; text: string }>> {
  try {
    const q = encodeURIComponent(query);
    const resp = await fetch(`https://r.jina.ai/https://html.duckduckgo.com/html/?q=${q}`, {
      headers: { Accept: "text/plain" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!resp.ok) return [];
    const raw = await resp.text();
    const results: Array<{ url: string; text: string }> = [];

    // Jina renders DDG results as ## sections — two formats:
    // Format A: ## [Title](ddg-redirect)
    // Format B: ## Plain Title\n[](ddg-redirect)
    // Split on either form
    for (const section of raw.split(/\n## /).slice(1)) {
      // URL: first uddg= parameter anywhere in the section
      const uddg = section.match(/uddg=([^&\s")\]]+)/);
      const url = uddg ? decodeURIComponent(uddg[1]) : "";
      if (!url) continue;

      // Snippets: long markdown link text or long plain lines
      const snippets: string[] = [];
      // Try markdown link text first: [text ≥60 chars](duckduckgo.com/...)
      const snippetRe = /\[([^\]]{60,})\]\(https:\/\/duckduckgo\.com[^)]+\)/g;
      let m: RegExpExecArray | null;
      while ((m = snippetRe.exec(section)) !== null) {
        const s = m[1].replace(/\*\*/g, "").trim();
        if (s.split(" ").length >= 4) snippets.push(s);
      }
      // Fallback: first plain heading line (format B title IS the snippet)
      if (snippets.length === 0) {
        const titleLine = section.split("\n")[0].replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/\*\*/g, "").trim();
        if (titleLine.split(" ").length >= 4) snippets.push(titleLine);
      }

      const text = snippets.join(" ").slice(0, 300);
      if (text.length > 30) results.push({ url, text });
    }
    return results.slice(0, 6);
  } catch (e) {
    logger.warn({ err: String(e) }, "social-listener: ddgSearch failed");
    return [];
  }
}

// ── Twitter/X — free actor (quacker~twitter-scraper) ─────────────────────────
async function scrapeX(keyword: string, apifyToken: string): Promise<Omit<ListeningMention, "group">[]> {
  try {
    const run = await fetch(
      "https://api.apify.com/v2/acts/quacker~twitter-scraper/run-sync-get-dataset-items?token=" +
        encodeURIComponent(apifyToken) + "&timeout=90",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ searchTerms: [keyword], maxItems: 30, sort: "Latest" }),
        signal: AbortSignal.timeout(100_000),
      }
    );
    if (!run.ok) return [];
    const items = (await run.json()) as any[];
    return (Array.isArray(items) ? items : []).slice(0, 30).map((t: any) => ({
      keyword,
      platform: "Twitter/X",
      text: t.full_text ?? t.text ?? "",
      url: t.url ?? `https://x.com/i/web/status/${t.id_str ?? t.id ?? ""}`,
      author: t.user?.screen_name ?? t.author?.userName ?? "",
      postedAt: t.created_at ?? t.createdAt ?? "",
    })).filter(m => m.text.length > 30 && !isOwnAccount(m.author ?? ""));
  } catch (e) {
    logger.warn({ keyword, err: String(e) }, "social-listener: X scrape failed");
    return [];
  }
}

// ── TikTok — free actor (clockworks~tiktok-scraper) ──────────────────────────
async function scrapeTikTok(keyword: string, apifyToken: string): Promise<Omit<ListeningMention, "group">[]> {
  try {
    const run = await fetch(
      "https://api.apify.com/v2/acts/clockworks~tiktok-scraper/run-sync-get-dataset-items?token=" +
        encodeURIComponent(apifyToken) + "&timeout=90",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ searchQueries: [keyword], maxItems: 15, type: "search" }),
        signal: AbortSignal.timeout(100_000),
      }
    );
    if (!run.ok) return [];
    const items = (await run.json()) as any[];
    return (Array.isArray(items) ? items : []).slice(0, 15).map((v: any) => ({
      keyword,
      platform: "TikTok",
      text: v.text ?? v.desc ?? v.description ?? "",
      url: v.webVideoUrl ?? v.videoUrl ?? v.url ?? "",
      author: v.authorMeta?.uniqueId ?? v.authorMeta?.name ?? v.author?.uniqueId ?? "",
      postedAt: v.createTimeISO ?? (v.createTime ? new Date(v.createTime * 1000).toISOString() : ""),
    })).filter(m => m.text.length > 30 && !isOwnAccount(m.author ?? ""));
  } catch (e) {
    logger.warn({ keyword, err: String(e) }, "social-listener: TikTok scrape failed");
    return [];
  }
}

// ── LinkedIn — DDG search filtered to linkedin.com posts ─────────────────────
async function scrapeLinkedIn(keyword: string): Promise<Omit<ListeningMention, "group">[]> {
  const results = await ddgSearch(`${keyword} site:linkedin.com/posts OR site:linkedin.com/pulse`);
  return results
    .filter(r => !r.url.includes("linkedin.com/company/qoyod"))
    .map(r => ({ keyword, platform: "LinkedIn", text: r.text, url: r.url, postedAt: new Date().toISOString() }));
}

// ── Threads — DDG search filtered to threads.net ─────────────────────────────
async function scrapeThreads(keyword: string): Promise<Omit<ListeningMention, "group">[]> {
  const results = await ddgSearch(`${keyword} site:threads.net`);
  return results.map(r => ({ keyword, platform: "Threads", text: r.text, url: r.url, postedAt: new Date().toISOString() }));
}

// ── Web (news/regulatory portals) ────────────────────────────────────────────
async function searchWeb(keyword: string): Promise<Omit<ListeningMention, "group">[]> {
  const results = await ddgSearch(
    `${keyword} site:arabianbusiness.com OR site:argaam.com OR site:mubasher.info OR site:zatca.gov.sa`
  );
  return results.map(r => ({ keyword, platform: "Web", text: r.text, url: r.url, postedAt: new Date().toISOString() }));
}

async function summarise(mentions: ListeningMention[]): Promise<string> {
  if (mentions.length === 0) return "لا توجد إشارات جديدة في آخر 6 ساعات.";

  const grouped = {
    brand:  mentions.filter(m => m.group === "brand"),
    zatca:  mentions.filter(m => m.group === "zatca"),
    market: mentions.filter(m => m.group === "market"),
  };

  const text = [
    `إشارات العلامة التجارية (${grouped.brand.length}): ${grouped.brand.slice(0, 3).map(m => m.text.slice(0, 120)).join(" | ")}`,
    `إشارات ZATCA/الفاتورة (${grouped.zatca.length}): ${grouped.zatca.slice(0, 3).map(m => m.text.slice(0, 120)).join(" | ")}`,
    `إشارات السوق (${grouped.market.length}): ${grouped.market.slice(0, 3).map(m => m.text.slice(0, 120)).join(" | ")}`,
  ].join("\n");

  const system = "أنت مراقب وسائل التواصل الاجتماعي لقيود. اكتب ملخصاً موجزاً بالعربية السعودية يجيب على: هل هناك شكاوى تحتاج رداً؟ هل هناك فرصة تسويقية؟ ما التوصية الأهم لفريق التسويق اليوم؟ اكتب نثراً مباشراً — لا قوائم ولا عناوين.";
  const user = `إليك الإشارات المرصودة في آخر 6 ساعات:\n${text}`;

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY ?? "";
    if (!apiKey) return "تعذر إنشاء الملخص — مفتاح API غير موجود.";
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 400,
        system,
        messages: [{ role: "user", content: user }],
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!resp.ok) return "تعذر إنشاء الملخص تلقائياً.";
    const data = await resp.json() as any;
    return data?.content?.[0]?.text?.trim() ?? "تعذر إنشاء الملخص تلقائياً.";
  } catch {
    return "تعذر إنشاء الملخص تلقائياً.";
  }
}

export async function runSocialListener(): Promise<ListeningResult> {
  const token = process.env.APIFY_TOKEN ?? "";
  const runAt = new Date().toISOString();
  const allMentions: ListeningMention[] = [];

  for (const [group, cfg] of Object.entries(KEYWORDS) as ["brand" | "zatca" | "market", GroupConfig][]) {
    for (const kw of cfg.terms) {
      // All applicable platform scrapers run in parallel per keyword
      const [xResults, liResults, ttResults, thResults] = await Promise.all([
        token          ? scrapeX(kw, token)      : Promise.resolve([]),
        cfg.linkedIn   ? scrapeLinkedIn(kw)      : Promise.resolve([]),
        (token && cfg.tiktok)  ? scrapeTikTok(kw, token) : Promise.resolve([]),
        cfg.threads    ? scrapeThreads(kw)       : Promise.resolve([]),
      ]);

      allMentions.push(
        ...xResults.map(m => ({ ...m, group })),
        ...liResults.map(m => ({ ...m, group })),
        ...ttResults.map(m => ({ ...m, group })),
        ...thResults.map(m => ({ ...m, group })),
      );

      // Web search fallback: always for zatca/market; for brand if no social results
      const hasSocial = xResults.length + liResults.length + ttResults.length + thResults.length > 0;
      if (cfg.webSearch || !hasSocial) {
        const webResults = await searchWeb(kw);
        allMentions.push(...webResults.map(m => ({ ...m, group })));
      }
    }
  }

  // Deduplicate by URL + text prefix
  const seen = new Set<string>();
  const unique = allMentions.filter(m => {
    const key = m.url ? m.url : m.text.slice(0, 50);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const summary = await summarise(unique);

  const result: ListeningResult = { runAt, mentions: unique, summary };

  try {
    fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
    fs.writeFileSync(CACHE_PATH, JSON.stringify(result, null, 2));
  } catch {}

  // Persist mentions to Sheets for queryable history
  sheetsAppendMentions(runAt, unique).catch(err =>
    logger.warn({ err: String(err) }, "social-listener: sheets append failed (non-fatal)")
  );
  sheetsLogActivity("social_listener", `Brand monitoring run — ${unique.length} mentions collected`, unique.length).catch(() => {});

  logger.info({ count: unique.length }, "social-listener: done");
  return result;
}

export function getLatestListeningResult(): ListeningResult | null {
  try {
    if (!fs.existsSync(CACHE_PATH)) return null;
    return JSON.parse(fs.readFileSync(CACHE_PATH, "utf8")) as ListeningResult;
  } catch { return null; }
}
