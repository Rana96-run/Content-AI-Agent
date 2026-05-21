import { Router } from "express";
import { diffSnapshots, buildAIPrompt, formatSlackBlocks, type CompetitorSnapshot } from "../lib/competitor-weekly-report.js";
import { runMonitorOnce } from "../lib/competitor-monitor.js";
import { scrapeYoutubeChannel } from "../lib/youtube-scraper.js";

const router = Router();

/* ─── POST /api/competitor-ads/run-monitor-now ───────────────────────────
   Manually trigger the weekly monitoring pipeline (scrape → diff → AI → Slack).
   Use this to test before Sunday, or to re-run after editing the
   tracked competitor list. */
router.post("/competitor-ads/run-monitor-now", async (req, res) => {
  const { competitors, postToSlack = false } = req.body ?? {};
  try {
    const result = await runMonitorOnce({ competitors, postToSlack: Boolean(postToSlack) });
    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

const APIFY_TIMEOUT_MS = 90_000;

/* ─── Competitor → identifiers map ────────────────────────────────────────
   Different Apify actors take different inputs (FB query, Google domain,
   IG handle). IG handles verified manually — null = no public IG. */
const COMPETITORS: Record<
  string,
  { domain: string; ig: string | null; fb_query: string; fb_page: string | null; tiktok: string | null; snapchat: string | null; linkedin: string | null; aliases: string[] }
> = {
  daftra:  { domain: "daftra.com",    ig: "daftraonline", fb_query: "daftra",     fb_page: "daftra",      tiktok: "daftra",      snapchat: "daftra",    linkedin: "daftra",     aliases: ["دفترة", "daftra"] },
  dafater: { domain: "dafater.com",   ig: null,           fb_query: "dafater",    fb_page: "dafater",     tiktok: null,          snapchat: null,        linkedin: "dafater",    aliases: ["دفاتر", "dafater"] },
  foodics: { domain: "foodics.com",   ig: "foodics",      fb_query: "foodics",    fb_page: "foodics",     tiktok: "foodics",     snapchat: "foodics",   linkedin: "foodics",    aliases: ["فودكس", "foodics"] },
  rewaa:   { domain: "rewaatech.com", ig: "rewaatech",    fb_query: "rewaa",      fb_page: "rewaatech",   tiktok: "rewaatech",   snapchat: "rewaatech", linkedin: "rewaatech",  aliases: ["رواء", "rewaa"] },
  wafeq:   { domain: "wafeq.com",     ig: "wafeq.app",    fb_query: "wafeq",      fb_page: "wafeq",       tiktok: "wafeqapp",    snapchat: null,        linkedin: "wafeq",      aliases: ["وافق", "wafeq"] },
  smacc:   { domain: "smacc.com",     ig: null,           fb_query: "smacc",      fb_page: "smacc.erp",   tiktok: null,          snapchat: null,        linkedin: "smacc",      aliases: ["smacc"] },
  zoho:    { domain: "zoho.com",      ig: "zoho",         fb_query: "zoho books", fb_page: "zoho",        tiktok: "zoho",        snapchat: "zoho",      linkedin: "zoho",       aliases: ["zoho", "zoho books"] },
};

function resolve(input: string) {
  const lc = input.trim().toLowerCase();
  for (const [, def] of Object.entries(COMPETITORS)) {
    if (def.aliases.some((a) => lc.includes(a.toLowerCase()))) return def;
  }
  return null;
}

/* ─── Free Google Ads scraper via r.jina.ai ───────────────────────────────
   Apify actors for Google Ads Transparency Center either don't support SA
   or return zero results. The page itself IS scrapeable via jina reader,
   which we already use for the URL fetcher. Parses the markdown response
   for ad image URLs + creative IDs. Returns image-only ad cards (no copy
   text — Google Ads Transparency doesn't show text in the listing view). */
async function scrapeGoogleAdsViaJina(domain: string, country: string): Promise<Array<{ page_name: string; hook: string; body: string; caption: string; image_url: string | null; detail_url: string | null; platforms: string[]; started: string }>> {
  const target = `https://adstransparency.google.com/?region=${country}&domain=${domain}`;
  const url = `https://r.jina.ai/${target}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 18_000);

  try {
    const r = await fetch(url, { headers: { Accept: "text/plain" }, signal: controller.signal });
    clearTimeout(timeoutId);
    if (!r.ok) return [];
    const text = await r.text();

    // Pull total ad count if present
    const countMatch = /~?(\d{1,4}(?:,\d{3})*)\s*ads/i.exec(text);
    const totalAds = countMatch ? countMatch[1] : null;

    // Extract advertiser display name (appears before "Verified")
    const nameMatch = /([A-Za-z0-9 ,.&'-]+)\s*\n\s*Verified/i.exec(text);
    const advertiserName = nameMatch ? nameMatch[1].trim() : domain;

    // Pattern: ![Image N](IMG_URL)](https://adstransparency.google.com/advertiser/AR.../creative/CR...)
    const pattern = /!\[Image \d+\]\(([^)]+)\)\]\((https:\/\/adstransparency\.google\.com\/advertiser\/(AR\d+)\/creative\/(CR\d+)[^)]*)\)/g;
    const ads: any[] = [];
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(text)) !== null) {
      ads.push({
        page_name: advertiserName,
        hook: `Google ad ${m[4].slice(2, 8)}`,
        body: totalAds ? `Part of ~${totalAds} active Google ads` : "Active Google ad",
        caption: "Click 'Preview' to view full creative on Google",
        image_url: m[1],
        detail_url: m[2],
        platforms: ["Google Ads"],
        started: "",
      });
    }
    return ads.slice(0, 10);
  } catch {
    clearTimeout(timeoutId);
    return [];
  }
}

/* ─── LinkedIn API scraper ────────────────────────────────────────────────
   Env vars (set in Railway):
     LI_ACCESS_TOKEN      — OAuth2 bearer token
     LI_ORGANIZATION_URN  — Qoyod's own URN (urn:li:organization:XXXXX)
     LI_BUSINESS_MANAGER_ID — Qoyod's Business Manager ID (for ads)
   Flow (organic posts):
     1. Resolve competitor vanity name → organization URN
     2. Fetch recent UGC posts for that URN
   Requires token scope: r_organization_social */
async function scrapeLinkedInViaAPI(slug: string, count: number): Promise<{
  ok: boolean;
  posts: any[];
  error?: string;
}> {
  const token = process.env.LI_ACCESS_TOKEN;
  if (!token) return { ok: false, posts: [], error: "LI_ACCESS_TOKEN not set in Railway environment" };

  const headers: Record<string, string> = {
    "Authorization": `Bearer ${token}`,
    "X-Restli-Protocol-Version": "2.0.0",
    "LinkedIn-Version": "202401",
  };

  try {
    // Step 1: get company URN from vanity name
    const orgUrl = `https://api.linkedin.com/v2/organizations?q=vanityName&vanityName=${encodeURIComponent(slug)}`;
    const orgResp = await fetch(orgUrl, { headers, signal: AbortSignal.timeout(15_000) });
    const orgData = (await orgResp.json().catch(() => ({}))) as any;

    if (!orgResp.ok || !orgData?.elements?.[0]?.id) {
      const errMsg = orgData?.message || orgData?.serviceErrorCode
        ? `${orgData.message || ""} (code ${orgData.serviceErrorCode || orgData.code || orgResp.status})`
        : `HTTP ${orgResp.status}`;
      return { ok: false, posts: [], error: `Could not resolve LinkedIn company '${slug}': ${errMsg}` };
    }

    const orgId = orgData.elements[0].id;
    const urn = `urn:li:organization:${orgId}`;

    // Step 2: fetch recent UGC posts for this org
    const postsUrl = `https://api.linkedin.com/v2/ugcPosts?q=authors&authors=List(${encodeURIComponent(urn)})&count=${count}&sortBy=LAST_MODIFIED`;
    const postsResp = await fetch(postsUrl, { headers, signal: AbortSignal.timeout(20_000) });
    const postsData = (await postsResp.json().catch(() => ({}))) as any;

    if (!postsResp.ok) {
      const errMsg = postsData?.message || postsData?.code || `HTTP ${postsResp.status}`;
      return { ok: false, posts: [], error: `LinkedIn posts API error: ${errMsg}` };
    }

    return { ok: true, posts: postsData?.elements || [] };
  } catch (err) {
    return { ok: false, posts: [], error: err instanceof Error ? err.message : String(err) };
  }
}

/* ─── LinkedIn Ads via Marketing API ─────────────────────────────────────
   Uses LI_ACCESS_TOKEN + LI_BUSINESS_MANAGER_ID to search the
   LinkedIn Ad Library for competitor sponsored content. */
async function scrapeLinkedInAdsViaAPI(query: string): Promise<{
  ok: boolean;
  ads: any[];
  error?: string;
}> {
  const token = process.env.LI_ACCESS_TOKEN;
  const bmId = process.env.LI_BUSINESS_MANAGER_ID;
  if (!token) return { ok: false, ads: [], error: "LI_ACCESS_TOKEN not set in Railway environment" };

  const headers: Record<string, string> = {
    "Authorization": `Bearer ${token}`,
    "X-Restli-Protocol-Version": "2.0.0",
    "LinkedIn-Version": "202401",
  };

  try {
    // LinkedIn Ad Library search endpoint — searches public sponsored content
    // by advertiser name keyword. Requires r_ads scope or Marketing API access.
    const params = new URLSearchParams({
      q: "search",
      "search.advertiserNames[0]": query,
      count: "10",
      ...(bmId ? { "search.sponsorAccountId": bmId } : {}),
    });
    const url = `https://api.linkedin.com/v2/adLibraryByShare?${params}`;
    const resp = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) });
    const data = (await resp.json().catch(() => ({}))) as any;

    if (!resp.ok) {
      // Fallback: try the adCreativesV2 search
      const errMsg = data?.message || data?.code || `HTTP ${resp.status}`;
      return { ok: false, ads: [], error: `LinkedIn Ads API: ${errMsg}` };
    }

    return { ok: true, ads: data?.elements || [] };
  } catch (err) {
    return { ok: false, ads: [], error: err instanceof Error ? err.message : String(err) };
  }
}

/* ─── LinkedIn Ad Library scraper via r.jina.ai ──────────────────────────
   LinkedIn's ad library is publicly accessible at:
   https://www.linkedin.com/ad-library/search?q=KEYWORD
   We scrape it the same way we do Google Ads — free via jina reader. */
async function scrapeLinkedInAdsViaJina(query: string): Promise<Array<{ page_name: string; hook: string; body: string; caption: string; image_url: string | null; detail_url: string | null; platforms: string[]; started: string }>> {
  const target = `https://www.linkedin.com/ad-library/search?q=${encodeURIComponent(query)}`;
  const url = `https://r.jina.ai/${target}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20_000);
  try {
    const r = await fetch(url, { headers: { Accept: "text/plain" }, signal: controller.signal });
    clearTimeout(timeoutId);
    if (!r.ok) return [];
    const text = await r.text();
    // Extract ad cards — LinkedIn ad library shows company name + ad text + CTA
    const ads: any[] = [];
    // Pattern: lines with advertiser name followed by ad body text
    const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
    let current: any = null;
    for (const line of lines) {
      if (line.match(/^\[.*\]\(https:\/\/www\.linkedin\.com\/company\//)) {
        if (current) ads.push(current);
        const nameMatch = /^\[([^\]]+)\]/.exec(line);
        const urlMatch = /\((https:\/\/www\.linkedin\.com\/company\/[^)]+)\)/.exec(line);
        current = { page_name: nameMatch?.[1] || query, hook: "", body: "", detail_url: urlMatch?.[1] || null };
      } else if (current && !current.hook && line.length > 10 && !line.startsWith("!") && !line.startsWith("#")) {
        current.hook = line.slice(0, 100);
      } else if (current && current.hook && !current.body && line.length > 10 && !line.startsWith("!")) {
        current.body = line.slice(0, 300);
      }
    }
    if (current) ads.push(current);
    return ads.slice(0, 10).map(a => ({
      page_name: a.page_name,
      hook: a.hook || `LinkedIn ad — ${query}`,
      body: a.body || "",
      caption: "LinkedIn Sponsored",
      image_url: null,
      detail_url: a.detail_url || `https://www.linkedin.com/ad-library/search?q=${encodeURIComponent(query)}`,
      platforms: ["LinkedIn Ads"],
      started: "",
      _source: "linkedin_ads",
    }));
  } catch {
    clearTimeout(timeoutId);
    return [];
  }
}

/* ─── Apify runner ────────────────────────────────────────────────────────
   Calls run-sync-get-dataset-items: starts the actor and returns the dataset
   contents in a single HTTP call (vs async runs that need polling). */
async function runActor(actor: string, input: object, token: string): Promise<{ ok: true; items: any[] } | { ok: false; status: number; error: string }> {
  const url = `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}&timeout=80`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), APIFY_TIMEOUT_MS);

  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!r.ok) {
      const errText = await r.text().catch(() => "");
      // Detect Apify monthly billing cap — return a sentinel so callers can
      // show a user-friendly message instead of raw JSON.
      if (
        errText.includes("Monthly usage hard limit exceeded") ||
        errText.includes("platform-feature-disabled")
      ) {
        return { ok: false, status: r.status, error: "APIFY_BILLING_LIMIT" };
      }
      return { ok: false, status: r.status, error: errText.slice(0, 300) || `Apify ${r.status}` };
    }

    const items = (await r.json()) as any[];
    return { ok: true, items: Array.isArray(items) ? items : [] };
  } catch (err) {
    clearTimeout(timeoutId);
    return { ok: false, status: 0, error: err instanceof Error ? err.message : String(err) };
  }
}

/* ─── GET /api/competitor-ads/health ─────────────────────────────────────── */
router.get("/competitor-ads/health", async (_req, res) => {
  const token = process.env.APIFY_TOKEN;
  if (!token) {
    res.status(200).json({ ok: false, configured: false, error: "APIFY_TOKEN not set" });
    return;
  }
  try {
    const r = await fetch(`https://api.apify.com/v2/users/me?token=${encodeURIComponent(token)}`, {
      signal: AbortSignal.timeout(8000),
    });
    const j = (await r.json().catch(() => ({}))) as { data?: { username?: string; usageMonthly?: any }; error?: any };
    if (!r.ok) {
      res.status(200).json({ ok: false, configured: true, error: j?.error?.message || `HTTP ${r.status}` });
      return;
    }
    res.status(200).json({ ok: true, configured: true, username: j.data?.username || "unknown" });
  } catch (err) {
    res.status(200).json({ ok: false, configured: true, error: err instanceof Error ? err.message : String(err) });
  }
});

/* ─── POST /api/competitor-ads ────────────────────────────────────────────
   Body: { source: "facebook" | "google" | "instagram", competitor: string,
           country?: "SA", limit?: 10 }
   Returns normalized {ads:[{page_name, hook, body, image_url, detail_url,
   platforms, started}]} regardless of source. */
router.post("/competitor-ads", async (req, res) => {
  const token = process.env.APIFY_TOKEN;
  if (!token) {
    res.status(500).json({ error: "APIFY_TOKEN not set in Railway" });
    return;
  }

  const { source, competitor, country = "SA", limit = 10 } = req.body ?? {};
  if (!competitor || typeof competitor !== "string") {
    res.status(400).json({ error: "Missing competitor" });
    return;
  }
  if (!source || !["facebook", "facebook_organic", "google", "instagram", "youtube", "tiktok", "tiktok_ads", "snapchat", "linkedin", "linkedin_ads"].includes(source)) {
    res.status(400).json({ error: 'source must be one of: facebook, facebook_organic, google, instagram, youtube, tiktok, tiktok_ads, snapchat, linkedin, linkedin_ads' });
    return;
  }

  const c = resolve(competitor);
  if (!c) {
    res.status(400).json({ error: `Unknown competitor: ${competitor}` });
    return;
  }

  // Cap user-facing display, but always request at least 10 from Apify (FB actor minimum)
  const cap = Math.min(Math.max(Number(limit) || 10, 1), 30);
  const apifyMinCount = Math.max(cap, 10);
  let actor = "";
  let input: any = {};

  if (source === "facebook") {
    actor = "curious_coder~facebook-ads-library-scraper";
    const fbUrl = `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=${country}&q=${encodeURIComponent(c.fb_query)}&search_type=keyword_unordered`;
    input = { urls: [{ url: fbUrl }], count: apifyMinCount };
  } else if (source === "facebook_organic") {
    if (!c.fb_page) {
      res.status(400).json({ error: `No Facebook page handle known for ${competitor}` });
      return;
    }
    // apify/facebook-pages-scraper: scrapes organic posts from a public Facebook page
    actor = "apify~facebook-pages-scraper";
    input = {
      startUrls: [{ url: `https://www.facebook.com/${c.fb_page}/` }],
      maxPosts: apifyMinCount,
      maxPostComments: 0,
      maxReviews: 0,
      scrapeAbout: false,
      scrapePosts: true,
    };
  } else if (source === "google") {
    // Google Ads doesn't go through Apify — we use the FREE r.jina.ai
    // reader proxy directly against Google Ads Transparency Center.
    // Apify actors for Google ads either don't support SA region or
    // returned 0 results across multiple actor variants. Jina works.
    const ads = await scrapeGoogleAdsViaJina(c.domain, country);
    res.status(200).json({
      ok: true,
      source: "google",
      competitor: c.domain,
      country,
      actor: "r.jina.ai (free)",
      count: ads.length,
      ads,
    });
    return;
  } else if (source === "instagram") {
    if (!c.ig) {
      res.status(400).json({ error: `No Instagram handle known for ${competitor}` });
      return;
    }
    actor = "apify~instagram-scraper";
    // Use directUrls (more reliable than username search)
    input = {
      directUrls: [`https://www.instagram.com/${c.ig}/`],
      resultsType: "posts",
      resultsLimit: apifyMinCount,
      addParentData: false,
    };
  } else if (source === "youtube") {
    // YouTube uses Google's official Data API (not Apify) — service account
    const yt = await scrapeYoutubeChannel(competitor, cap);
    res.status(200).json({
      ok: yt.ok,
      source: "youtube",
      competitor: c.domain,
      country,
      actor: "youtube-data-api-v3",
      channel_id: yt.channelId,
      count: yt.videos.length,
      ads: yt.videos,
      ...(yt.error ? { error: yt.error } : {}),
    });
    return;
  } else if (source === "tiktok") {
    if (!c.tiktok) {
      res.status(400).json({ error: `No TikTok handle known for ${competitor}` });
      return;
    }
    // clockworks/free-tiktok-scraper: accepts profiles array, returns posts with
    // text, videoUrl, webVideoUrl, authorMeta.name, diggCount, shareCount, playCount
    actor = "clockworks~free-tiktok-scraper";
    input = {
      profiles: [`https://www.tiktok.com/@${c.tiktok}`],
      resultsPerPage: apifyMinCount,
      shouldDownloadVideos: false,
      shouldDownloadCovers: false,
    };
  } else if (source === "tiktok_ads") {
    // TikTok Ad Library: scrapes paid ads by advertiser name/keyword
    // apify/tiktok-ads-library-scraper searches library.tiktok.com/ads
    actor = "apify~tiktok-ads-library-scraper";
    input = {
      searchKeyword: c.tiktok || c.fb_query,
      countryCode: country,
      limit: apifyMinCount,
    };
  } else if (source === "snapchat") {
    if (!c.snapchat) {
      res.status(400).json({ error: `No Snapchat handle known for ${competitor}` });
      return;
    }
    // apify/snapchat-scraper: scrapes public Snapchat story/spotlight pages
    actor = "apify~snapchat-scraper";
    input = {
      usernames: [c.snapchat],
      resultsLimit: apifyMinCount,
    };
  } else if (source === "linkedin") {
    if (!c.linkedin) {
      res.status(400).json({ error: `No LinkedIn company slug known for ${competitor}` });
      return;
    }
    // LinkedIn REST API — uses LINKEDIN_TOKEN env var (OAuth2 bearer token)
    const li = await scrapeLinkedInViaAPI(c.linkedin, cap);
    if (!li.ok) {
      res.status(502).json({ error: li.error, source: "linkedin", competitor: c.domain });
      return;
    }
    const ads = li.posts.map((p: any) => normalizeLinkedIn(p));
    res.status(200).json({ ok: true, source: "linkedin", competitor: c.domain, country, actor: "linkedin-api-v2", count: ads.length, ads });
    return;
  } else if (source === "linkedin_ads") {
    // LinkedIn Marketing API ad library search
    const liAds = await scrapeLinkedInAdsViaAPI(c.linkedin || c.fb_query);
    if (!liAds.ok) {
      res.status(502).json({ error: liAds.error, source: "linkedin_ads", competitor: c.domain });
      return;
    }
    const ads = liAds.ads.map((a: any) => normalizeLinkedInAd(a));
    res.status(200).json({ ok: true, source: "linkedin_ads", competitor: c.domain, country, actor: "linkedin-marketing-api", count: ads.length, ads });
    return;
  }

  const result = await runActor(actor, input, token);
  if (!result.ok) {
    // eslint-disable-next-line no-console
    console.error(`[competitor-ads] ${source} failed`, result);
    if (result.error === "APIFY_BILLING_LIMIT") {
      // Return 200 with a structured flag so the client can render a friendly notice
      res.status(200).json({
        ok: false,
        billing_limit: true,
        error: "رصد المنافسين متوقف مؤقتاً — وصل حساب Apify لحد الاستخدام الشهري. يُعاد التشغيل تلقائياً في أول الشهر القادم.",
      });
      return;
    }
    res.status(502).json({ error: result.error, source, competitor: c.domain, actor });
    return;
  }

  // Normalize across sources
  const rawAds = result.items.slice(0, cap).map((it) => normalize(it, source));

  // ─── Cleanup pass ──────────────────────────────────────────────
  // 1. Drop Meta Dynamic Product Ads (DPA): ads whose copy is just
  //    template placeholders like {{product.name}} — Meta substitutes
  //    real catalog values at delivery time, so the scraped copy has
  //    no analyzable signal for us.
  // 2. Content-hash dedup: same competitor often re-runs the same
  //    creative across audiences/placements; each instance has a
  //    different Apify id but identical copy. Collapse to one entry.
  const TEMPLATE_RE = /\{\{[^}]+\}\}/;
  const HASHTAG_RE = /#[\p{L}\p{N}_]+/gu;        // unicode-aware (Arabic + English)
  const URL_RE = /https?:\/\/\S+/g;
  const MIN_REAL_WORDS = 3;                       // post must have ≥ 3 non-hashtag, non-URL words

  const seen = new Set<string>();
  const ads = rawAds.filter((a) => {
    // Only hook + body are reliably real copy. Caption is overloaded
    // (engagement metrics for organic FB/Snap/TikTok, format for Google).
    const realText = `${a.hook ?? ""} ${a.body ?? ""}`.trim();
    if (!realText) return false;

    // Skip DPA templates (Meta dynamic catalog ads — visible copy is just placeholders)
    if (TEMPLATE_RE.test(realText)) return false;

    // Skip hashtag-dumps: posts whose only "content" is #tags (and maybe a URL).
    // Strip hashtags + URLs, then count remaining words. If < 3 real words, drop.
    const stripped = realText
      .replace(HASHTAG_RE, " ")
      .replace(URL_RE, " ")
      .trim();
    const realWordCount = stripped.split(/\s+/).filter(w => w.length > 1).length;
    if (realWordCount < MIN_REAL_WORDS) return false;

    // Dedup by page_name + first 100 chars of meaningful copy
    const key = `${(a.page_name || "").toLowerCase().trim()}|${realText.slice(0, 100).toLowerCase().replace(/\s+/g, " ")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Debug mode: include first raw item so we can see actual field names
  const debug = req.body?._debug;
  res.status(200).json({
    ok: true,
    source,
    competitor: c.domain,
    country,
    actor,
    count: ads.length,
    raw_count: rawAds.length,
    filtered_out: rawAds.length - ads.length,
    ads,
    ...(debug && result.items[0] ? { _raw_keys: Object.keys(result.items[0]).slice(0, 30), _raw_sample: result.items[0] } : {}),
  });
});

/* ─── POST /api/competitor-ads/weekly-report-preview ──────────────────────
   Manual trigger: scrapes 3 competitors right now, builds a fake "last
   week" baseline (empty for first run), runs AI summary, returns Slack
   blocks. Use this to validate the report format before wiring auto-cron. */
router.post("/competitor-ads/weekly-report-preview", async (req, res) => {
  const apifyToken = process.env.APIFY_TOKEN;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!apifyToken || !anthropicKey) {
    res.status(500).json({ error: "APIFY_TOKEN or ANTHROPIC_API_KEY not set" });
    return;
  }
  const { competitors = ["Daftra", "Foodics", "Rewaa"], country = "SA" } = req.body ?? {};

  // Fetch current week for each competitor (parallel)
  const thisWeek: CompetitorSnapshot[] = [];
  for (const compName of competitors) {
    const c = resolve(compName);
    if (!c) continue;
    const snap: CompetitorSnapshot = {
      competitor: compName,
      domain: c.domain,
      fetched_at: new Date().toISOString(),
    };
    // Run all 3 sources in parallel
    const results = await Promise.allSettled([
      runActor("curious_coder~facebook-ads-library-scraper", { urls: [{ url: `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=${country}&q=${encodeURIComponent(c.fb_query)}&search_type=keyword_unordered` }], count: 10 }, apifyToken),
      runActor("solidcode~ads-transparency-scraper", { startUrls: [{ url: `https://adstransparency.google.com/?region=${country}&domain=${c.domain}` }], maxResults: 10 }, apifyToken),
      c.ig
        ? runActor("apify~instagram-scraper", { directUrls: [`https://www.instagram.com/${c.ig}/`], resultsType: "posts", resultsLimit: 10, addParentData: false }, apifyToken)
        : Promise.resolve({ ok: true, items: [] } as const),
    ]);
    const fb = results[0].status === "fulfilled" && results[0].value.ok ? results[0].value.items.map((i) => normalize(i, "facebook")) : [];
    const goog = results[1].status === "fulfilled" && results[1].value.ok ? results[1].value.items.map((i) => normalize(i, "google")) : [];
    const ig = results[2].status === "fulfilled" && results[2].value.ok ? results[2].value.items.map((i) => normalize(i, "instagram")) : [];
    snap.facebook = fb;
    snap.google = goog;
    snap.instagram = ig;
    thisWeek.push(snap);
  }

  // For preview, treat lastWeek as empty so everything shows as "new"
  const diffs = thisWeek.map((tw) => diffSnapshots(tw, null));
  const weekLabel = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const { system, user } = buildAIPrompt(diffs, weekLabel);

  // Call Anthropic for the AI summary (using same generate route logic)
  const aiResp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": anthropicKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5",
      max_tokens: 2500,
      system,
      messages: [{ role: "user", content: user }, { role: "assistant", content: "{" }],
    }),
  });
  const aiData = (await aiResp.json().catch(() => ({}))) as any;
  let ai: any = {};
  try {
    const text = "{" + (aiData.content?.[0]?.text || "");
    ai = JSON.parse(text);
  } catch {
    ai = { headline: "AI parse failed", competitors: [], recommended_actions: [], alert: null };
  }

  const blocks = formatSlackBlocks(diffs, ai, weekLabel);
  res.status(200).json({ ok: true, week: weekLabel, diffs, ai, slack_blocks: blocks });
});

/* ─── GET /api/competitor-ads/actor-schema?id=user~name ───────────────────
   Returns the actor's input schema so we know what fields it expects. */
router.get("/competitor-ads/actor-schema", async (req, res) => {
  const token = process.env.APIFY_TOKEN;
  if (!token) {
    res.status(500).json({ error: "APIFY_TOKEN not set" });
    return;
  }
  const id = String(req.query.id || "").trim();
  if (!id) {
    res.status(400).json({ error: "Missing id parameter" });
    return;
  }
  try {
    const r = await fetch(`https://api.apify.com/v2/acts/${id}?token=${encodeURIComponent(token)}`, {
      signal: AbortSignal.timeout(10000),
    });
    const j = (await r.json().catch(() => ({}))) as { data?: any };
    if (!r.ok) {
      res.status(r.status).json({ error: `HTTP ${r.status}` });
      return;
    }
    const a = j.data || {};
    res.status(200).json({
      id: `${a.username}~${a.name}`,
      title: a.title,
      defaultRunInput: a.defaultRunOptions?.input,
      exampleInput: a.exampleRunInput || a.defaultRunInput,
      inputSchema: a.inputSchema ? Object.keys(a.inputSchema?.properties || {}) : null,
      readme_excerpt: (a.readme || "").slice(0, 1000),
    });
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

/* ─── GET /api/competitor-ads/discover-actor?q=google+ads ─────────────────
   Helper to find the right Apify actor ID for a search term, since
   actor names change and there's no canonical list. */
router.get("/competitor-ads/discover-actor", async (req, res) => {
  const token = process.env.APIFY_TOKEN;
  if (!token) {
    res.status(500).json({ error: "APIFY_TOKEN not set" });
    return;
  }
  const q = String(req.query.q || "").trim();
  if (!q) {
    res.status(400).json({ error: "Missing q parameter" });
    return;
  }
  try {
    const r = await fetch(
      `https://api.apify.com/v2/store?search=${encodeURIComponent(q)}&limit=10&token=${encodeURIComponent(token)}`,
      { signal: AbortSignal.timeout(10000) },
    );
    const j = (await r.json().catch(() => ({}))) as { data?: { items?: any[] } };
    const items = (j.data?.items || []).map((it: any) => ({
      id: `${it.username}~${it.name}`,
      title: it.title,
      runs: it.stats?.totalRuns,
      users: it.stats?.totalUsers,
    }));
    res.status(200).json({ q, count: items.length, items });
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

/* ─── LinkedIn API post normalizer ───────────────────────────────────────
   Maps LinkedIn UGC Posts API shape to the common ad shape. */
function normalizeLinkedIn(p: any) {
  // Text lives in specificContent.com.linkedin.ugc.ShareContent.shareCommentary.text
  const text = p?.specificContent?.["com.linkedin.ugc.ShareContent"]?.shareCommentary?.text
    || p?.commentary || p?.text || "";
  // Media: image or video thumbnail
  const media = p?.specificContent?.["com.linkedin.ugc.ShareContent"]?.media?.[0];
  const imageUrl = media?.thumbnails?.[0]?.url || media?.originalUrl || null;
  const detailUrl = media?.landingPage?.landingPageUrl || null;
  // Engagement stats (v2 API sometimes includes socialDetail)
  const stats = p?.socialDetail;
  const likes    = stats?.totalSocialActivityCounts?.numLikes    || 0;
  const comments = stats?.totalSocialActivityCounts?.numComments || 0;
  const reposts  = stats?.totalSocialActivityCounts?.numShares   || 0;
  const parts: string[] = [];
  if (likes)    parts.push(`${Number(likes).toLocaleString()} likes`);
  if (comments) parts.push(`${Number(comments).toLocaleString()} comments`);
  if (reposts)  parts.push(`${Number(reposts).toLocaleString()} reposts`);
  // Date: created.time is epoch ms
  const created = p?.created?.time ? new Date(p.created.time).toISOString() : "";
  return {
    page_name:  p?.author || "",
    hook:       text.split("\n")[0]?.slice(0, 80) || "",
    body:       text,
    caption:    parts.length ? parts.join(" · ") : "LinkedIn post",
    image_url:  imageUrl,
    detail_url: detailUrl || `https://www.linkedin.com/feed/update/${p?.id || ""}`,
    platforms:  ["LinkedIn"],
    started:    created,
    _source:    "linkedin",
  };
}

/* ─── LinkedIn Ad normalizer (Marketing API adLibraryByShare shape) ─────── */
function normalizeLinkedInAd(a: any) {
  const creative = a?.creative || a;
  const text = creative?.variables?.data?.["com.linkedin.ads.SponsoredUpdateCreativeVariables"]
    ?.activity?.["com.linkedin.ugc.Share"]?.commentary
    || a?.shareText || a?.text || "";
  return {
    page_name:  a?.advertiserName || a?.sponsorName || "",
    hook:       text.split("\n")[0]?.slice(0, 80) || `LinkedIn Sponsored — ${a?.advertiserName || ""}`,
    body:       text,
    caption:    a?.callToAction || a?.ctaLabel || "LinkedIn Sponsored",
    image_url:  a?.imageUrl || null,
    detail_url: a?.destinationUrl || null,
    platforms:  ["LinkedIn Ads"],
    started:    a?.startDate || a?.createdAt || "",
    _source:    "linkedin_ads",
  };
}

/* ─── Normalize each source's response into a common ad shape ────────── */
function normalize(item: any, source: string) {
  if (source === "facebook") {
    return {
      page_name: item.advertiser?.name || item.page_name || item.pageName || "",
      hook: item.snapshot?.title || item.title || "",
      body: item.snapshot?.body?.markdown || item.body || item.snapshot?.body?.text || "",
      caption: item.snapshot?.link_description || "",
      image_url: item.snapshot?.images?.[0]?.original_image_url || item.snapshot?.cards?.[0]?.original_image_url || null,
      detail_url: item.url || item.snapshotUrl || null,
      platforms: item.publisher_platform || item.publisherPlatforms || [],
      started: item.start_date_string || item.startDate,
    };
  }
  if (source === "google") {
    return {
      page_name: item.advertiserName || item.advertiser_name || "",
      hook: item.title || "",
      body: item.description || item.body || "",
      caption: item.format || "",
      image_url: item.imageUrl || item.image || null,
      detail_url: item.creativeUrl || item.url || null,
      platforms: ["Google " + (item.format || "Ad")],
      started: item.firstShown || item.lastShown,
    };
  }
  if (source === "facebook_organic") {
    // apify/facebook-pages-scraper post shape
    const likes  = item.likes  || item.likesCount  || 0;
    const shares = item.shares || item.sharesCount || 0;
    const text   = item.text   || item.message     || "";
    return {
      page_name:  item.pageName || item.name || "",
      hook:       text.split("\n")[0]?.slice(0, 80) || "",
      body:       text,
      caption:    `${Number(likes).toLocaleString()} likes, ${Number(shares).toLocaleString()} shares`,
      image_url:  item.media?.[0]?.url || item.topImage || null,
      detail_url: item.url || null,
      platforms:  ["Facebook"],
      started:    item.time || item.date || "",
    };
  }
  if (source === "tiktok_ads") {
    // apify/tiktok-ads-library-scraper ad shape
    const text = item.ad_text || item.description || item.caption || "";
    return {
      page_name:  item.advertiser_name || item.brand_name || "",
      hook:       text.split("\n")[0]?.slice(0, 80) || item.ad_id || "",
      body:       text,
      caption:    item.cta_text || item.call_to_action || "",
      image_url:  item.image_url || item.cover_image || item.thumbnail || null,
      detail_url: item.ad_url || null,
      platforms:  ["TikTok Ads"],
      started:    item.first_shown || item.create_time || "",
    };
  }
  if (source === "snapchat") {
    const views = item.viewCount || item.views || 0;
    const caption = item.caption || item.description || item.title || "";
    return {
      page_name: item.username || item.displayName || "",
      hook:      caption.split("\n")[0]?.slice(0, 80) || "",
      body:      caption,
      caption:   views ? `${Number(views).toLocaleString()} views` : "Snapchat post",
      image_url: item.thumbnailUrl || item.imageUrl || null,
      detail_url: item.url || (item.username ? `https://www.snapchat.com/add/${item.username}` : null),
      platforms:  ["Snapchat"],
      started:    item.timestamp || item.createdAt || "",
    };
  }
  if (source === "tiktok") {
    const plays    = item.playCount    || item.stats?.playCount    || 0;
    const likes    = item.diggCount    || item.stats?.diggCount    || 0;
    const shares   = item.shareCount   || item.stats?.shareCount   || 0;
    const comments = item.commentCount || item.stats?.commentCount || 0;
    const text     = item.text || item.desc || "";
    const parts: string[] = [];
    if (plays)    parts.push(`${Number(plays).toLocaleString()} views`);
    if (likes)    parts.push(`${Number(likes).toLocaleString()} likes`);
    if (comments) parts.push(`${Number(comments).toLocaleString()} comments`);
    if (shares)   parts.push(`${Number(shares).toLocaleString()} shares`);
    return {
      page_name:  item.authorMeta?.name || item.author?.uniqueId || "",
      hook:       text.split("\n")[0]?.slice(0, 80) || "",
      body:       text,
      caption:    parts.length ? parts.join(" · ") : "",
      image_url:  item.mediaUrls?.[0] || item.covers?.[0] || item.cover || null,
      detail_url: item.webVideoUrl || null,
      platforms:  ["TikTok"],
      // createTimeISO is the direct ISO string — prefer it over multiplying createTime
      started:    item.createTimeISO || (item.createTime ? new Date(item.createTime * 1000).toISOString() : ""),
    };
  }
  if (source === "linkedin_api") {
    // handled by normalizeLinkedIn — this branch shouldn't be hit but kept as guard
  }
  if (source === "linkedin") {
    // legacy Apify shape (kept as fallback)
    const text    = item.text || item.commentary || item.description || "";
    const likes   = item.numLikes   || item.likeCount   || item.reactions?.numLikes   || 0;
    const comments= item.numComments|| item.commentCount|| 0;
    const reposts = item.numShares  || item.repostCount || 0;
    const parts: string[] = [];
    if (likes)    parts.push(`${Number(likes).toLocaleString()} likes`);
    if (comments) parts.push(`${Number(comments).toLocaleString()} comments`);
    if (reposts)  parts.push(`${Number(reposts).toLocaleString()} reposts`);
    return {
      page_name:  item.authorName  || item.companyName || item.author?.name || "",
      hook:       text.split("\n")[0]?.slice(0, 80) || "",
      body:       text,
      caption:    parts.length ? parts.join(" · ") : "LinkedIn post",
      image_url:  item.image || item.imgUrl || item.images?.[0] || null,
      detail_url: item.url  || item.postUrl || null,
      platforms:  ["LinkedIn"],
      started:    item.postedAt || item.createdAt || item.date || "",
    };
  }
  // instagram
  {
    const views    = item.videoViewCount || item.videoPlayCount || 0;
    const likes    = item.likesCount     || 0;
    const comments = item.commentsCount  || 0;
    const parts: string[] = [];
    if (views)    parts.push(`${Number(views).toLocaleString()} views`);
    if (likes)    parts.push(`${Number(likes).toLocaleString()} likes`);
    if (comments) parts.push(`${Number(comments).toLocaleString()} comments`);
    return {
      page_name:  item.ownerUsername || item.owner_username || "",
      hook:       (item.caption || "").split("\n")[0]?.slice(0, 80) || "",
      body:       item.caption || "",
      caption:    parts.length ? parts.join(" · ") : "",
      image_url:  item.displayUrl || item.thumbnailUrl || null,
      detail_url: item.url || null,
      platforms:  ["Instagram"],
      started:    item.timestamp || "",
    };
  }
}

export default router;
