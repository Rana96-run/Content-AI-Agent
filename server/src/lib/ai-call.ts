/**
 * Tiny AI helper used by background workers (customer-voice, zatca-watcher,
 * competitor-monitor) so they don't each duplicate Anthropic call code.
 *
 * Always uses Anthropic primary — these are non-user-facing background jobs
 * where reliability matters more than provider fallback. Failures are
 * logged and swallowed by callers.
 */

export async function callClaude(
  system: string,
  user: string,
  maxTokens: number,
): Promise<any> {
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
      max_tokens: maxTokens,
      system,
      messages: [
        { role: "user", content: user },
        { role: "assistant", content: "{" },
      ],
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!r.ok) throw new Error(`Anthropic ${r.status}`);
  const data = (await r.json()) as any;
  const text = "{" + (data.content?.[0]?.text || "");
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
