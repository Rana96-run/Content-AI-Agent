/* ══════════════════════════════════════════════════════════════════
   Qoyod Creative Agent — Persona definitions

   The single tool-use loop in agent.ts runs "as" one persona per task.
   Each persona is (a) a scoped tool whitelist so the agent doesn't
   reach for off-brief tools, and (b) a role-specific system prompt
   layered on top of the shared brand/voice prompt.

   The dispatcher in agent.ts infers which persona a trigger maps to by
   matching keywords in the body; a caller can also force it via
   trigger.context.persona = "paid_media_analyst" etc.
   ══════════════════════════════════════════════════════════════════ */

export type PersonaId =
  | "social_media"
  | "content_creator"
  | "email_lifecycle"
  | "editor_qa"
  | "orchestrator"; // the default — has access to everything, picks on its own

export interface PersonaDef {
  id: PersonaId;
  label: string;           // Arabic label shown in UI
  label_en: string;        // English label
  tagline: string;         // one-line role description
  tools: string[];         // tool whitelist (empty = all tools)
  prompt: string;          // persona-specific system-prompt addendum
  /* Keywords (ar + en lower-cased) used by the dispatcher to auto-route
     triggers when no explicit persona is specified. Longer/more specific
     phrases win; ties fall back to orchestrator. */
  match: string[];
}

export const PERSONAS: Record<PersonaId, PersonaDef> = {
  social_media: {
    id: "social_media",
    label: "متخصص السوشيال",
    label_en: "Social Media Specialist",
    tagline: "محتوى + تحليل منافسين + أداء اورجانيك",
    tools: [
      "analyze_competitor_content",
      "build_content_calendar",
      "generate_content",
      "generate_hashtags",
      "generate_video_script",
      "analyze_metrics_report",
      "translate_copy",
      "save_to_drive",
      "content_library_save",
      "content_library_read",
      "brand_fact_lookup",
    ],
    prompt: `ROLE: Social Media Specialist (organic).
- Plan daily content, analyze competitors, and read ORGANIC performance — impressions, reach, saves, shares, follower growth, engagement rate. Leave paid metrics to whoever's running media.
- Always open with competitor context if the brief mentions a rival or category — call analyze_competitor_content first.
- When given organic metrics, call analyze_metrics_report and frame the insight as: what content type is winning, what to double down on, what to kill.
- Blend TOF / MOF / BOF 60/30/10 across each week.
- Hooks must land in ≤6 Arabic words for Reels/TikTok.
- Channel voice: Instagram = visual + crisp, LinkedIn = proof + ROI, TikTok = raw energy, Twitter = witty quick-takes, Snapchat = promo + urgency.
- Every caption: 1 hook → 1 message → 1 CTA → 1 trust signal.
`,
    match: [
      "social",
      "سوشيال",
      "انستقرام",
      "instagram",
      "tiktok",
      "linkedin",
      "twitter",
      "snap",
      "كالندر",
      "calendar",
      "منافس",
      "competitor",
      "organic",
      "اورجانيك",
      "engagement",
      "تفاعل",
      "reach",
      "وصول",
    ],
  },

  content_creator: {
    id: "content_creator",
    label: "كاتب محتوى",
    label_en: "Content Creator",
    tagline: "ad copy · Google Ads · captions · blogs",
    tools: [
      "generate_content",
      "generate_google_ads_rsa",
      "build_blog_article",
      "review_copy",
      "translate_copy",
      "generate_hashtags",
      "save_to_drive",
      "content_library_save",
      "content_library_read",
      "brand_fact_lookup",
    ],
    prompt: `ROLE: Content Creator. Arabic-first Saudi-dialect copywriter.
- Every Google RSA: 15 headlines (≤30 chars ar, ≤30 chars en), 4 descriptions (≤90 chars ar / en).
- For captions: hook at char 1, CTA on its own line.
- Forbidden dialect markers (ZERO tolerance): مش, ايه, ازاي, بتاع, يلا. Use: مو, وش, ليش.
- After writing, self-review via review_copy before final output.
`,
    match: [
      "copy",
      "نسخة",
      "كوبي",
      "headline",
      "هيدلاين",
      "caption",
      "كابشن",
      "google ads",
      "إعلان جوجل",
      "article",
      "مقال",
      "blog",
      "مدونة",
    ],
  },

  email_lifecycle: {
    id: "email_lifecycle",
    label: "إيميل & سيكونس",
    label_en: "Email / Lifecycle Marketer",
    tagline: "welcome · nurture · winback",
    tools: [
      "build_email_sequence",
      "generate_content",
      "review_copy",
      "translate_copy",
      "publish_hubspot",
      "save_to_drive",
      "brand_fact_lookup",
    ],
    prompt: `ROLE: Email / Lifecycle Marketer.
- Subject ≤45 chars Arabic, preheader ≤90 chars.
- One CTA per email — no forks.
- Send-cadence defaults: Welcome Day 0/2/5/9; Nurture weekly; Winback Day 14/30/60.
- Mobile-first HTML, table-based layout, inline CSS only.
`,
    match: ["email", "ايميل", "بريد", "nurture", "drip", "sequence", "سلسلة"],
  },

  editor_qa: {
    id: "editor_qa",
    label: "محرر / جودة",
    label_en: "Editor / Copy QA",
    tagline: "brand voice · dialect · consistency",
    tools: ["review_copy", "translate_copy", "save_to_drive", "brand_fact_lookup"],
    prompt: `ROLE: Editor / Copy QA. Strict gatekeeper.
- Flag (and fix) any Egyptian-dialect leak.
- Enforce one-hook / one-message / one-CTA / one-trust.
- Reject vague claims about ZATCA or customer count if not verifiable.
`,
    match: ["review", "مراجعة", "qa", "تدقيق", "editor", "محرر"],
  },

  orchestrator: {
    id: "orchestrator",
    label: "كل الأدوات",
    label_en: "Orchestrator",
    tagline: "كل شي في مهمة وحدة",
    tools: [], // empty = all tools
    prompt: `ROLE: Creative Orchestrator. You have access to every tool and can coordinate a multi-specialist workflow in a single task.
- For complex requests, first call brief_to_spec, then execute specialist tools in sequence.
- End with a consolidated deliverable plus links to every artifact produced.
`,
    match: [], // default fallback
  },
};

/* Pick the best persona for a given free-form trigger body.
   Simple scoring: +2 per exact phrase match, +1 per token match.
   Explicit override via context.persona always wins. */
export function pickPersona(body: string, explicit?: string): PersonaId {
  if (explicit && (PERSONAS as Record<string, PersonaDef>)[explicit]) {
    return explicit as PersonaId;
  }
  const text = (body || "").toLowerCase();
  if (!text.trim()) return "orchestrator";
  let best: { id: PersonaId; score: number } = { id: "orchestrator", score: 0 };
  for (const p of Object.values(PERSONAS)) {
    if (p.id === "orchestrator") continue;
    let score = 0;
    for (const kw of p.match) {
      const needle = kw.toLowerCase();
      if (text.includes(needle)) score += needle.includes(" ") ? 3 : 2;
    }
    if (score > best.score) best = { id: p.id, score };
  }
  /* Require a meaningful match before specializing — otherwise orchestrator. */
  return best.score >= 2 ? best.id : "orchestrator";
}

/* Filter the global tools array down to a persona's whitelist. Memory
   tools (read/write) are always granted — every persona benefits from
   remembering past wins, so we don't force each whitelist to list them. */
const ALWAYS_ON = new Set(["memory_read", "memory_write"]);

export function personaTools<T extends { name: string }>(
  allTools: readonly T[],
  personaId: PersonaId,
): T[] {
  const p = PERSONAS[personaId];
  if (!p.tools.length) return [...allTools];
  const set = new Set(p.tools);
  return allTools.filter((t) => set.has(t.name) || ALWAYS_ON.has(t.name));
}
