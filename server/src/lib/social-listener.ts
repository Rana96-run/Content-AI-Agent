/**
 * Social Listener — runs every 6 hours
 * Monitors X/Twitter and web for Qoyod brand + ZATCA/regulatory keywords.
 * Saves summary to data/listening-cache.json and optionally to Google Drive.
 */
import fs from "fs";
import path from "path";
import { logger } from "./logger.js";
import { driveUploadAsGoogleDoc } from "../routes/drive.js";
import { callClaude } from "./ai-call.js";

const CACHE_PATH = path.resolve(process.cwd(), "data", "listening-cache.json");

const KEYWORDS = {
  brand:  ["قيود", "qoyod", "برنامج قيود"],
  zatca:  ["هيئة الزكاة والضريبة", "ZATCA", "الفاتورة الالكترونية", "المرحلة الثانية للفاتورة", "فاتورة ضريبية"],
  market: ["وزارة التجارة السعودية", "برنامج محاسبي سعودي", "نظام ERP سعودي"],
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
  driveLink?: string;
}

async function scrapeX(keyword: string, apifyToken: string): Promise<ListeningMention[]> {
  try {
    const run = await fetch("https://api.apify.com/v2/acts/apidojo~tweet-flash/run-sync-get-dataset-items?token=" + encodeURIComponent(apifyToken) + "&timeout=60", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        searchTerms: [keyword],
        maxTweets: 15,
        language: "ar",
      }),
      signal: AbortSignal.timeout(70_000),
    });
    if (!run.ok) return [];
    const items = (await run.json()) as any[];
    return (Array.isArray(items) ? items : []).slice(0, 15).map((t: any) => ({
      keyword,
      group: "brand" as const,
      platform: "Twitter/X",
      text: t.full_text ?? t.text ?? "",
      url: `https://x.com/i/web/status/${t.id_str ?? t.id ?? ""}`,
      author: t.user?.screen_name ?? "",
      postedAt: t.created_at ?? "",
    }));
  } catch (e) {
    logger.warn({ keyword, err: String(e) }, "social-listener: X scrape failed");
    return [];
  }
}

async function searchWeb(keyword: string): Promise<ListeningMention[]> {
  try {
    const encoded = encodeURIComponent(`"${keyword}"`);
    const resp = await fetch(`https://r.jina.ai/https://www.google.com/search?q=${encoded}&hl=ar&gl=sa`, {
      headers: { Accept: "text/plain", "X-Timeout": "10" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!resp.ok) return [];
    const text = await resp.text();
    const kw5 = keyword.slice(0, 5);
    const snippets = text.split("\n").filter(l => l.length > 60 && l.includes(kw5));
    return snippets.slice(0, 4).map(s => ({
      keyword,
      group: "brand" as const,
      platform: "Web",
      text: s.slice(0, 300),
      url: "",
      postedAt: new Date().toISOString(),
    }));
  } catch {
    return [];
  }
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

  const system = "أنت مراقب وسائل التواصل الاجتماعي لقيود. اكتب ملخصاً موجزاً بالعربية يجيب على: هل هناك شكاوى تحتاج رداً؟ هل هناك فرصة تسويقية؟ ما التوصية الأهم لفريق التسويق اليوم؟";
  const user = `إليك الإشارات المرصودة في آخر 6 ساعات:\n${text}`;

  try {
    const result = await callClaude(system, user, 400);
    // callClaude returns parsed JSON — if it fails, we get null
    if (typeof result === "object" && result !== null) {
      return JSON.stringify(result);
    }
  } catch {}
  return "تعذر إنشاء الملخص تلقائياً.";
}

export async function runSocialListener(): Promise<ListeningResult> {
  const token = process.env.APIFY_TOKEN ?? "";
  const runAt = new Date().toISOString();
  const allMentions: ListeningMention[] = [];

  for (const [group, keywords] of Object.entries(KEYWORDS) as [keyof typeof KEYWORDS, string[]][]) {
    for (const kw of keywords) {
      const xResults = token ? await scrapeX(kw, token) : [];
      allMentions.push(...xResults.map(m => ({ ...m, group })));
      const webResults = await searchWeb(kw);
      allMentions.push(...webResults.map(m => ({ ...m, group })));
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

  let driveLink: string | undefined;
  if (unique.length > 0) {
    const date = runAt.slice(0, 10);
    const doc = `رصد السوشيال — ${date}\n\n${summary}\n\n---\n\n` +
      unique.map(m => `[${m.platform}] ${m.keyword}\n${m.text}\n${m.url}`).join("\n\n");
    try {
      const link = await driveUploadAsGoogleDoc(`Social Listening — ${date}`, doc);
      driveLink = typeof link === "string" ? link : undefined;
    } catch (e) {
      logger.warn({ err: String(e) }, "social-listener: drive upload failed (non-fatal)");
    }
  }

  const result: ListeningResult = { runAt, mentions: unique, summary, driveLink };

  try {
    fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
    fs.writeFileSync(CACHE_PATH, JSON.stringify(result, null, 2));
  } catch {}

  logger.info({ count: unique.length }, "social-listener: done");
  return result;
}

export function getLatestListeningResult(): ListeningResult | null {
  try {
    if (!fs.existsSync(CACHE_PATH)) return null;
    return JSON.parse(fs.readFileSync(CACHE_PATH, "utf8")) as ListeningResult;
  } catch { return null; }
}
