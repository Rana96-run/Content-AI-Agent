import { Router } from "express";

const router = Router();

const FETCH_TIMEOUT_MS = 15_000;
const MAX_CONTENT_CHARS = 8_000;

// Detect login walls / blocked content patterns from common platforms.
// If the fetched content matches these, it means we got the auth gate, not the post.
const BLOCKED_PATTERNS = [
  /Log in to (Facebook|Instagram|TikTok|LinkedIn)/i,
  /Sign up for (Twitter|X)/i,
  /You need to log in/i,
  /Mobile number, username or email/i,
  /Log into Instagram/i,
  /This page isn't available/i,
  /Page not found/i,
];

// Strip noise (login forms, footer junk) so the AI gets only the real post body.
function looksBlocked(content: string): boolean {
  return BLOCKED_PATTERNS.some((p) => p.test(content));
}

// Trim out reader-mode header chrome that jina prepends ("Title:", "URL Source:", etc.)
// and cap to a reasonable length so we don't blow the prompt budget.
function clean(raw: string): string {
  return raw
    .replace(/^Title:.*$/m, "")
    .replace(/^URL Source:.*$/m, "")
    .replace(/^Markdown Content:.*$/m, "")
    .replace(/!\[Image \d+\]\([^)]+\)/g, "") // strip image markdown
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // unwrap links to plain text
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_CONTENT_CHARS);
}

router.post("/fetch-url", async (req, res) => {
  const { url } = req.body ?? {};

  if (!url || typeof url !== "string") {
    res.status(400).json({ error: "Missing url" });
    return;
  }

  // Validate URL — only http/https
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    res.status(400).json({ error: "Invalid URL" });
    return;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    res.status(400).json({ error: "Only http/https URLs are supported" });
    return;
  }

  const host = parsed.hostname.toLowerCase();

  // Use jina reader proxy — it returns clean markdown of any public URL
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const r = await fetch(`https://r.jina.ai/${url}`, {
      headers: { Accept: "text/plain" },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!r.ok) {
      res.status(200).json({ ok: false, blocked: false, error: `Reader returned ${r.status}` });
      return;
    }

    const raw = await r.text();
    if (looksBlocked(raw)) {
      res.status(200).json({
        ok: false,
        blocked: true,
        platform: host,
        message: "Page requires login. Paste the post text/caption directly.",
      });
      return;
    }

    const content = clean(raw);
    if (!content || content.length < 50) {
      res.status(200).json({ ok: false, blocked: false, error: "Page returned empty content" });
      return;
    }

    res.status(200).json({ ok: true, content, length: content.length, host });
  } catch (err) {
    clearTimeout(timeoutId);
    const msg = err instanceof Error ? err.message : String(err);
    res.status(200).json({ ok: false, blocked: false, error: msg });
  }
});

export default router;
