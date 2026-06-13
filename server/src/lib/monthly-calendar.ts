/**
 * Monthly Content Calendar — runs on the 1st of each month at 08:00 UTC.
 *
 * Generates a full 4-week calendar for the coming month:
 *   - 30 posts across Instagram, LinkedIn, TikTok, X/Twitter, Snapchat
 *   - TOF/MOF/BOF mix (60/30/10)
 *   - Informed by brand law + latest competitor context
 *   - Saved to Drive "Content" subfolder + logged to Documents Log
 *   - Posted to Slack
 *
 * Manual trigger: POST /api/agent/monthly-calendar/run-now
 */

import { logger } from "./logger.js";
import { getBrandLawSnippet } from "./qoyod-brand-law.js";
import { getContextSnippet } from "./competitor-context.js";
import { driveUploadAsGoogleDoc } from "../routes/drive.js";
import { sheetsLogDocument } from "./sheets-client.js";

const CHECK_INTERVAL_MS = 60 * 60 * 1_000;
let _lastRunMonth = "";

function shouldRunNow(): boolean {
  const now = new Date();
  if (now.getUTCDate() !== 1) return false;
  if (now.getUTCHours() !== 8) return false;
  const monthKey = now.toISOString().slice(0, 7);
  if (_lastRunMonth === monthKey) return false;
  return true;
}

function nextMonthLabel(): string {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().slice(0, 7); // "YYYY-MM"
}

async function callClaude(system: string, user: string, max_tokens: number): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
      max_tokens,
      system,
      messages: [{ role: "user", content: user }],
    }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!r.ok) throw new Error(`Anthropic ${r.status}`);
  const data = (await r.json()) as any;
  return data.content?.[0]?.text ?? "";
}

export async function runMonthlyCalendar(): Promise<{ ok: boolean; link?: string; error?: string }> {
  logger.info("monthly-calendar: starting");

  const month = nextMonthLabel();
  const brandLaw = getBrandLawSnippet();
  const compSnippet = getContextSnippet();
  const compBrief = compSnippet ? `\n\nسياق المنافسين:\n${compSnippet.slice(0, 1200)}` : "";

  const system = `أنت مخطط محتوى سوشيال ميديا لشركة قيود (برنامج محاسبة سعودي معتمد من ZATCA).
${brandLaw}
قواعد صارمة: لهجة سعودية خالصة، بدون إيموجي، رسالة واحدة لكل منشور، CTA واحدة، عنصر ثقة واحد.
التوزيع المستهدف: 60% TOF, 30% MOF, 10% BOF.`;

  const user = `أنشئ خطة محتوى شاملة لشهر ${month} — 30 منشوراً موزعة على 4 أسابيع عبر المنصات التالية: Instagram, LinkedIn, TikTok, X/Twitter, Snapchat.${compBrief}

أرجع JSON فقط بهذا الشكل:
{
  "month": "${month}",
  "total_posts": 30,
  "weeks": [
    {
      "week": 1,
      "dates": "1–7 ${month}",
      "theme": "موضوع الأسبوع بالعربية",
      "posts": [
        {
          "day": "الأحد",
          "channel": "Instagram",
          "funnel": "TOF",
          "hook": "الجملة الافتتاحية",
          "caption": "النص الكامل (max 150 كلمة)",
          "format": "Static | Reel | Carousel",
          "cta": "نص الـCTA"
        }
      ]
    }
  ],
  "monthly_themes": ["ثيم 1", "ثيم 2", "ثيم 3"],
  "hook_angles_used": ["خوف", "وقت", "بساطة", "تحكم", "ثقة"]
}

وزّع المنشورات: Instagram 10, LinkedIn 6, TikTok 6, X/Twitter 5, Snapchat 3.`;

  let calendarJson: any;
  try {
    const raw = await callClaude(system, user, 6000);
    const fi = raw.indexOf("{");
    const li = raw.lastIndexOf("}");
    calendarJson = JSON.parse(raw.slice(fi, li + 1));
  } catch (e) {
    logger.error({ err: String(e) }, "monthly-calendar: AI parse failed");
    return { ok: false, error: String(e) };
  }

  // Build a human-readable doc for Drive
  const lines: string[] = [
    `<h1>خطة المحتوى الشهرية — ${month}</h1>`,
    `<p><strong>المواضيع الشهرية:</strong> ${(calendarJson.monthly_themes || []).join(" · ")}</p>`,
    `<p><strong>زوايا الـhook المستخدمة:</strong> ${(calendarJson.hook_angles_used || []).join("، ")}</p>`,
    `<p><strong>إجمالي المنشورات:</strong> ${calendarJson.total_posts ?? 30}</p>`,
    "<hr>",
  ];

  for (const week of calendarJson.weeks ?? []) {
    lines.push(`<h2>الأسبوع ${week.week} — ${week.dates ?? ""}</h2>`);
    lines.push(`<p><em>موضوع الأسبوع: ${week.theme ?? ""}</em></p>`);
    lines.push("<table border='1' cellpadding='6' style='border-collapse:collapse;width:100%;direction:rtl'>");
    lines.push("<tr><th>اليوم</th><th>المنصة</th><th>القمع</th><th>الـHook</th><th>التعليق</th><th>الصيغة</th><th>CTA</th></tr>");
    for (const p of week.posts ?? []) {
      lines.push(`<tr><td>${p.day}</td><td>${p.channel}</td><td>${p.funnel}</td><td>${p.hook}</td><td style='max-width:300px'>${p.caption}</td><td>${p.format}</td><td>${p.cta}</td></tr>`);
    }
    lines.push("</table><br>");
  }

  const html = `<html><body style="font-family:Cairo,Arial,sans-serif;direction:rtl;text-align:right;padding:40px">${lines.join("\n")}</body></html>`;
  const title = `خطة المحتوى — ${month}`;

  let link: string | undefined;
  try {
    const result = await driveUploadAsGoogleDoc(title, html, "Content");
    link = result.link ?? undefined;
    if (link) {
      const date = new Date().toISOString().slice(0, 10);
      sheetsLogDocument({ date, type: "Content Calendar", title, link }).catch(() => {});
    }
  } catch (e) {
    logger.warn({ err: String(e) }, "monthly-calendar: drive save failed (non-fatal)");
  }

  // Slack summary
  const slackToken = process.env.SLACK_BOT_TOKEN;
  const slackChannel = process.env.SLACK_DEFAULT_CHANNEL;
  if (slackToken && slackChannel) {
    const weekSummary = (calendarJson.weeks ?? [])
      .map((w: any) => `الأسبوع ${w.week}: ${w.theme} (${(w.posts ?? []).length} منشور)`)
      .join("\n");
    const msg = `*خطة المحتوى الشهرية — ${month}*\n\n${weekSummary}\n\nإجمالي: ${calendarJson.total_posts ?? 30} منشور${link ? `\n\n${link}` : ""}`;
    fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8", Authorization: `Bearer ${slackToken}` },
      body: JSON.stringify({ channel: slackChannel, text: msg }),
    }).catch(() => {});
  }

  _lastRunMonth = new Date().toISOString().slice(0, 7);
  logger.info({ month, link }, "monthly-calendar: complete");
  return { ok: true, link };
}

export function startMonthlyCalendar(): void {
  setInterval(() => {
    if (!shouldRunNow()) return;
    runMonthlyCalendar().catch(err =>
      logger.error({ err: String(err) }, "monthly-calendar: scheduled run failed")
    );
  }, CHECK_INTERVAL_MS);
  logger.info("monthly-calendar: scheduler started — 1st of month 08:00 UTC");
}
