import { Router } from "express";
import { createHash } from "crypto";
import { getContextSnippet } from "../lib/competitor-context.js";
import { getBrandLawSnippet, getCreativeKit } from "../lib/qoyod-brand-law.js";
import { getCustomerVoiceSnippet } from "../lib/customer-voice.js";
import { getZatcaSnippet } from "../lib/zatca-watcher.js";
import { getPatternLibrarySnippet } from "../lib/pattern-library.js";
import { getKnowledgeSnippet } from "../lib/knowledge-base.js";
import { getICPContextSnippet } from "../lib/icp-context.js";

const router = Router();

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const MAX_PROMPT_CHARS = 20_000;
const MAX_OUTPUT_TOKENS = 8192;
const ANTHROPIC_TIMEOUT_MS = 120_000;
const OPENAI_TIMEOUT_MS = 90_000;
const GEMINI_TIMEOUT_MS = 90_000;
const MAX_RETRIES = 3;

// ─── A) Multi-provider fallback ────────────────────────────────────────────
// Tries Anthropic with retries; falls back to Gemini on terminal failure.
// Both providers return responses in Anthropic's content[].text shape.
//
// ─── B) Request deduplication ──────────────────────────────────────────────
// In-memory cache: same (system + user + max_tokens + json_mode) within 30s
// returns the cached response. Prevents accidental double-clicks from spending
// tokens twice. Cache is per-process (resets on Railway redeploy).
//
// ─── C) Health probe ───────────────────────────────────────────────────────
// /api/ai-health endpoint pings Anthropic with a 1-token request. Used by the
// client to show a degraded-mode banner if Anthropic is unreachable.

type Resp = { ok: true; data: any; provider: "anthropic" | "openai" | "gemini" } | { ok: false; status: number | null; error: string };

// ─── Retry helpers ──────────────────────────────────────────────────────────

function shouldRetry(status: number | null, attempt: number): boolean {
  if (attempt >= MAX_RETRIES) return false;
  if (status === null) return true;
  if (status === 429 || status === 529) return true;
  if (status >= 500 && status <= 599) return true;
  return false;
}

function backoffMs(attempt: number): number {
  return 800 * Math.pow(2, attempt) + Math.random() * 400;
}

// ─── Anthropic call with retry ──────────────────────────────────────────────

async function callAnthropic(apiKey: string, body: object): Promise<Resp> {
  let lastError = "Unknown error";
  let lastStatus: number | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), ANTHROPIC_TIMEOUT_MS);

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        return { ok: true, data, provider: "anthropic" };
      }

      lastStatus = res.status;
      const errBody = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      lastError = errBody?.error?.message || `Anthropic API error ${res.status}`;

      if (!shouldRetry(res.status, attempt)) return { ok: false, status: res.status, error: lastError };
      // eslint-disable-next-line no-console
      console.warn(`[anthropic] retry ${attempt + 1}/${MAX_RETRIES} after ${res.status}: ${lastError}`);
    } catch (err) {
      clearTimeout(timeoutId);
      lastStatus = null;
      lastError = err instanceof Error ? err.message : String(err);
      if (!shouldRetry(null, attempt)) return { ok: false, status: null, error: lastError };
      // eslint-disable-next-line no-console
      console.warn(`[anthropic] retry ${attempt + 1}/${MAX_RETRIES} after network: ${lastError}`);
    }

    if (attempt < MAX_RETRIES) await new Promise((r) => setTimeout(r, backoffMs(attempt)));
  }

  return { ok: false, status: lastStatus, error: lastError };
}

// ─── OpenAI fallback (between Anthropic and Gemini) ────────────────────────

async function callOpenAI(
  apiKey: string,
  system: string,
  user: string,
  maxTokens: number,
  jsonMode: boolean,
): Promise<Resp> {
  const body: any = {
    model: OPENAI_MODEL,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    max_tokens: Math.min(maxTokens, MAX_OUTPUT_TOKENS),
    temperature: 0.7,
  };
  if (jsonMode) body.response_format = { type: "json_object" };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      const errBody = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      return { ok: false, status: res.status, error: errBody?.error?.message || `OpenAI error ${res.status}` };
    }

    const oa = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = oa.choices?.[0]?.message?.content || "";
    if (!text) return { ok: false, status: 502, error: "OpenAI returned empty response" };

    // Reshape to Anthropic format so client is provider-agnostic
    return {
      ok: true,
      data: { content: [{ type: "text", text }], model: OPENAI_MODEL, fallback: true },
      provider: "openai",
    };
  } catch (err) {
    clearTimeout(timeoutId);
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, status: null, error: msg };
  }
}

// ─── Gemini fallback (single attempt, no retry — already a fallback) ────────

async function callGemini(
  apiKey: string,
  system: string,
  user: string,
  maxTokens: number,
  jsonMode: boolean,
): Promise<Resp> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const body: any = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ text: user }] }],
    generationConfig: {
      maxOutputTokens: Math.min(maxTokens, MAX_OUTPUT_TOKENS),
      temperature: 0.7,
    },
  };
  if (jsonMode) body.generationConfig.responseMimeType = "application/json";

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      const errBody = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      return { ok: false, status: res.status, error: errBody?.error?.message || `Gemini error ${res.status}` };
    }

    const gem = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const text = gem.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
    if (!text) return { ok: false, status: 502, error: "Gemini returned empty response" };

    // Reshape to Anthropic format so client doesn't need to care which provider
    return {
      ok: true,
      data: { content: [{ type: "text", text }], model: GEMINI_MODEL, fallback: true },
      provider: "gemini",
    };
  } catch (err) {
    clearTimeout(timeoutId);
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, status: null, error: msg };
  }
}

// ─── Provider chain: Anthropic → OpenAI → Gemini ────────────────────────────

async function generateWithFallback(
  system: string,
  user: string,
  maxTokens: number,
  jsonMode: boolean,
): Promise<Resp> {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;

  // Layer 1: Anthropic (primary, with retry)
  if (anthropicKey) {
    const messages: Array<{ role: string; content: string }> = [
      { role: "user", content: user },
      ...(jsonMode ? [{ role: "assistant", content: "{" }] : []),
    ];

    const result = await callAnthropic(anthropicKey, {
      model: MODEL,
      max_tokens: Math.min(maxTokens, MAX_OUTPUT_TOKENS),
      system,
      messages,
    });

    if (result.ok) {
      if (jsonMode && result.data.content?.[0]?.text !== undefined) {
        result.data.content[0].text = "{" + result.data.content[0].text;
      }
      return result;
    }
    // eslint-disable-next-line no-console
    console.warn(`[generate] Anthropic exhausted, trying OpenAI: ${result.error}`);
  }

  // Layer 2: OpenAI (first fallback)
  if (openaiKey) {
    const result = await callOpenAI(openaiKey, system, user, maxTokens, jsonMode);
    if (result.ok) return result;
    // eslint-disable-next-line no-console
    console.warn(`[generate] OpenAI also failed, trying Gemini: ${result.error}`);
  }

  // Layer 3: Gemini (last resort)
  if (geminiKey) {
    const result = await callGemini(geminiKey, system, user, maxTokens, jsonMode);
    if (result.ok) return result;
    // eslint-disable-next-line no-console
    console.error(`[generate] All providers failed. Last error: ${result.error}`);
    return result;
  }

  return {
    ok: false,
    status: 500,
    error: "No AI provider configured (ANTHROPIC_API_KEY, OPENAI_API_KEY, or GEMINI_API_KEY)",
  };
}

// ─── Output humaniser ───────────────────────────────────────────────────────
// Strips decorative markdown (headers, bold, italic, horizontal rules) from AI
// output so it reads as natural Arabic prose rather than a structured document.
function humaniseOutput(text: string): string {
  return text
    .replace(/^#{1,4}\s+/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/^[-*_]{3,}\s*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ─── Dedup cache ────────────────────────────────────────────────────────────

const DEDUP_TTL_MS = 30_000;
const dedupCache = new Map<string, { ts: number; resp: any }>();

function cacheKey(system: string, user: string, max_tokens: number, json_mode: boolean): string {
  return createHash("sha256")
    .update(`${system} ${user} ${max_tokens} ${json_mode}`)
    .digest("hex");
}

function pruneCache() {
  const now = Date.now();
  for (const [k, v] of dedupCache) {
    if (now - v.ts > DEDUP_TTL_MS) dedupCache.delete(k);
  }
}

// ─── Main route ─────────────────────────────────────────────────────────────

router.post("/generate", async (req, res) => {
  const {
    system,
    user,
    max_tokens = 1400,
    json_mode = false,
    skip_competitor_context = false,
    skip_brand_law = false,
    skip_customer_voice = false,
    skip_zatca = false,
    skip_pattern_library = false,
    skip_knowledge = false,
    persona,
    creative_kit = false,
  } = req.body ?? {};

  if (!system || !user) {
    res.status(400).json({ error: "Missing system or user prompt" });
    return;
  }

  // Layered system-prompt enrichment (knowledge feeds, in order of importance):
  //   1. Brand law           — Qoyod's non-negotiable identity, dialect, golden rule
  //   2. Creative kit        — sector + hook + competitor angles (only for content gen)
  //   3. Competitor context  — what rivals shipped this week (auto-refreshed Sunday)
  //   4. Customer voice (D2) — real pain quotes from App Store / Play Store / X
  //   5. ZATCA intel (D3)    — recent regulatory news + opportunities
  //   6. Pattern library     — WIN-tagged hypotheses as few-shot examples (D1)
  //   7. Knowledge base      — accumulated ICP signals, proven hooks, sector patterns,
  //                            anti-patterns extracted from every weekly monitor run.
  //                            This layer COMPOUNDS over time — unlike 3-6 which are
  //                            weekly snapshots, this grows indefinitely.
  // All can be opted out per request for non-creative endpoints.
  const lawSnippet = skip_brand_law ? "" : `\n\n${getBrandLawSnippet(persona)}\n\n`;
  const kitSnippet = creative_kit ? `\n\n${getCreativeKit()}\n\n` : "";
  const ctxSnippet = skip_competitor_context ? "" : getContextSnippet();
  const voiceSnippet = skip_customer_voice ? "" : getCustomerVoiceSnippet();
  const zatcaSnippet = skip_zatca ? "" : getZatcaSnippet();
  // Pattern library + Knowledge base + ICP signals are all async (read Sheet)
  const [patternSnippet, knowledgeSnippet, icpSnippet] = await Promise.all([
    skip_pattern_library ? Promise.resolve("") : getPatternLibrarySnippet(),
    skip_knowledge ? Promise.resolve("") : getKnowledgeSnippet(),
    getICPContextSnippet(),
  ]);
  const enrichedSystem =
    lawSnippet +
    String(system) +
    kitSnippet +
    ctxSnippet +
    voiceSnippet +
    zatcaSnippet +
    patternSnippet +
    knowledgeSnippet +
    icpSnippet;

  const totalLength = enrichedSystem.length + String(user).length;
  if (totalLength > MAX_PROMPT_CHARS) {
    res.status(400).json({ error: `Prompt too long (${totalLength} chars > ${MAX_PROMPT_CHARS})` });
    return;
  }

  const tokens = Math.min(Number(max_tokens) || 1400, MAX_OUTPUT_TOKENS);
  const jm = Boolean(json_mode);

  // Dedup: same request within 30s returns cached response
  pruneCache();
  const key = cacheKey(enrichedSystem, String(user), tokens, jm);
  const cached = dedupCache.get(key);
  if (cached && Date.now() - cached.ts < DEDUP_TTL_MS) {
    res.set("X-Cache", "HIT");
    res.status(200).json(cached.resp);
    return;
  }

  const result = await generateWithFallback(enrichedSystem, String(user), tokens, jm);

  if (!result.ok) {
    // eslint-disable-next-line no-console
    console.error("[generate] failed", { status: result.status, error: result.error });
    const status = result.status && result.status >= 400 && result.status < 600 ? result.status : 502;
    res.status(status).json({ error: result.error });
    return;
  }

  // Stamp the provider so the client can show a "fallback active" hint if it wants
  if (result.provider !== "anthropic") result.data.provider = result.provider;

  // Strip decorative markdown from AI output — convert to natural prose
  if (!json_mode && result.data.content?.[0]?.text) {
    result.data.content[0].text = humaniseOutput(result.data.content[0].text);
  }

  dedupCache.set(key, { ts: Date.now(), resp: result.data });
  res.set("X-Cache", "MISS");
  res.set("X-Provider", result.provider);
  res.status(200).json(result.data);
});

// ─── Health probe ───────────────────────────────────────────────────────────

router.get("/ai-health", async (_req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(200).json({ ok: false, provider: "none", error: "No ANTHROPIC_API_KEY", fallback_available: !!process.env.GEMINI_API_KEY });
    return;
  }

  const t0 = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 5,
        messages: [{ role: "user", content: "ping" }],
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    const latency = Date.now() - t0;

    if (r.ok) {
      res.status(200).json({ ok: true, provider: "anthropic", latency_ms: latency, fallback_available: !!process.env.GEMINI_API_KEY });
      return;
    }

    res.status(200).json({
      ok: false,
      provider: "anthropic",
      status: r.status,
      latency_ms: latency,
      degraded: true,
      fallback_available: !!process.env.GEMINI_API_KEY,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    res.status(200).json({
      ok: false,
      provider: "anthropic",
      error: err instanceof Error ? err.message : String(err),
      degraded: true,
      fallback_available: !!process.env.GEMINI_API_KEY,
    });
  }
});

export default router;
