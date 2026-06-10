import { PERSONAS, type PersonaId } from "./agent-personas.js";

/* ══════════════════════════════════════════════════════════════════
   @mention parser — pull explicit persona handles out of free-form
   trigger text. Supports both English handles and Arabic aliases.

     "@writer draft captions"          → persona = "content_creator"
     "@مصمم اعمل بوستر"                → persona = "graphic_designer"
     "@social @editor review calendar" → persona = "social_media" (first wins),
                                         mentions = ["social_media","editor_qa"]

   We don't throw on unknown handles — we just strip them. The existing
   pickPersona() keyword fallback takes over when no @handle is present.
   ══════════════════════════════════════════════════════════════════ */

/* Handle → persona map. Keep this tight — add new aliases as needed. */
const HANDLE_MAP: Record<string, PersonaId> = {
  // social
  social: "social_media",
  "سوشيال": "social_media",
  sm: "social_media",
  // content
  copy: "content_creator",
  writer: "content_creator",
  content: "content_creator",
  "محتوى": "content_creator",
  "كاتب": "content_creator",
  // email
  email: "email_lifecycle",
  lifecycle: "email_lifecycle",
  "بريد": "email_lifecycle",
  "ايميل": "email_lifecycle",
  // pr — handled by content_creator (no dedicated pr_comms persona currently)
  pr: "content_creator",
  press: "content_creator",
  comms: "content_creator",
  "إعلام": "content_creator",
  "بيان": "content_creator",
  // editor
  editor: "editor_qa",
  qa: "editor_qa",
  review: "editor_qa",
  "محرر": "editor_qa",
  "مراجعة": "editor_qa",
  // orchestrator
  orchestrator: "orchestrator",
  boss: "orchestrator",
  "الوكيل": "orchestrator",
};

/* Canonical persona ids are also valid handles. */
for (const id of Object.keys(PERSONAS) as PersonaId[]) {
  HANDLE_MAP[id] = id;
}

export interface MentionParse {
  /* First @handle found — use as the explicit persona route. */
  primary?: PersonaId;
  /* Every recognized persona handle in order — useful for multi-step routing. */
  all: PersonaId[];
  /* The body with @handles stripped, so the agent doesn't see its own address label. */
  clean: string;
  /* Unknown @handles (e.g. @rana) we pass through as "actors" rather than personas. */
  actors: string[];
}

/* Matches @word where word is a unicode letter run. Arabic letters included. */
const MENTION_RE = /(^|\s)@([A-Za-z\u0600-\u06FF_][A-Za-z0-9\u0600-\u06FF_-]*)/g;

export function parseMentions(input: string): MentionParse {
  const text = input || "";
  const all: PersonaId[] = [];
  const actors: string[] = [];
  const seen = new Set<PersonaId>();

  const clean = text.replace(MENTION_RE, (_m, pre: string, handle: string) => {
    const key = handle.toLowerCase();
    const pid = HANDLE_MAP[key];
    if (pid) {
      if (!seen.has(pid)) {
        seen.add(pid);
        all.push(pid);
      }
      return pre; // drop the @handle from the body
    }
    actors.push(handle);
    return pre + "@" + handle; // keep unknown @mentions as-is
  });

  return {
    primary: all[0],
    all,
    clean: clean.replace(/\s{2,}/g, " ").trim(),
    actors,
  };
}
