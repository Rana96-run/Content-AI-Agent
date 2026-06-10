#!/usr/bin/env tsx
/* ══════════════════════════════════════════════════════════════════
   Qoyod Creative Agent — interactive console

   A lightweight REPL that talks to a running dev server over HTTP.
   Useful when you want to fire a quick task without opening the web
   UI — e.g. over SSH, or while tailing logs in another pane.

   Start the server separately (`npm run dev`), then from another
   terminal:  `npm run console`

   Built-in prompts (type `/help` to see all):
     /p <id>         switch persona (social_media, content_creator, email_lifecycle, …)
     /personas       list personas
     /ask <text>     send a free-form task to the current persona
     /quick <key>    run a preset (see QUICK_PROMPTS below)
     /tasks          list last 10 tasks
     /task <id>      inspect one task (steps + outputs)
     /cache          show tool-cache stats
     /cache clear    wipe the cache
     /memory         show facts + persona notes + recent recall
     /fact <id>=<…>  upsert a brand fact
     /note <text>    jot a note scoped to the current persona
     /skip           toggle skipCache for the next /ask
     /host <url>     point at a different server (default localhost:8787)
     /q              quit

   Anything else is treated like an /ask on the current persona.
   ══════════════════════════════════════════════════════════════════ */

import readline from "readline";
import { stdin as input, stdout as output } from "process";

const DEFAULT_HOST = process.env.CREATIVE_OS_HOST || "http://localhost:8787";
const PASSWORD = process.env.TEAM_PASSWORD || "";

let host = DEFAULT_HOST;
let persona = "orchestrator";
let skipCacheNext = false;

/* Canned one-liners so you don't retype the long briefs. */
const QUICK_PROMPTS: Record<string, { persona: string; body: string; title: string }> = {
  calendar: {
    persona: "social_media",
    title: "Weekly content calendar",
    body: "اعمل كالندر محتوى لأسبوع لقيود: 5 ريلز، 3 لينكدإن، 2 تويتر. اذكر الهوك والـCTA لكل بوست.",
  },
  rsa: {
    persona: "content_creator",
    title: "Google RSA — Qoyod trial",
    body: "Write a Google RSA for Qoyod free trial — 15 Arabic headlines + 4 descriptions, validated.",
  },
  competitor: {
    persona: "social_media",
    title: "Competitor scan — Zoho Books",
    body: "Analyze zohobooks.com/sa content pillars vs. Qoyod. What gaps should we exploit this quarter?",
  },
  review: {
    persona: "editor_qa",
    title: "Copy QA",
    body: "Run a brand-voice pass on the last deliverable. Flag any dialect leaks.",
  },
  welcome: {
    persona: "email_lifecycle",
    title: "Welcome sequence",
    body: "Build a 4-email welcome sequence for Qoyod trial signups. Arabic-first.",
  },
  poster: {
    persona: "graphic_designer",
    title: "Ramadan poster",
    body: "اعمل تصميم بوستر رمضاني لقيود، 1:1، بالتطبيق على الألوان الرسمية.",
  },
  press: {
    persona: "pr_comms",
    title: "Partnership press release",
    body: "Draft a bilingual press release announcing a Qoyod × (placeholder) partnership.",
  },
};

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    "Content-Type": "application/json",
    ...(PASSWORD ? { "x-team-password": PASSWORD } : {}),
    ...extra,
  };
}

async function api(pathname: string, init?: RequestInit): Promise<any> {
  const r = await fetch(`${host}${pathname}`, {
    ...init,
    headers: { ...authHeaders(), ...(init?.headers as any) },
  });
  const text = await r.text();
  try {
    return JSON.parse(text);
  } catch {
    return { _raw: text, _status: r.status };
  }
}

function dim(s: string) { return `\x1b[2m${s}\x1b[0m`; }
function bold(s: string) { return `\x1b[1m${s}\x1b[0m`; }
function cyan(s: string) { return `\x1b[36m${s}\x1b[0m`; }
function green(s: string) { return `\x1b[32m${s}\x1b[0m`; }
function red(s: string) { return `\x1b[31m${s}\x1b[0m`; }
function yellow(s: string) { return `\x1b[33m${s}\x1b[0m`; }

function banner() {
  console.log(bold(cyan("\n  Qoyod Creative Agent — console")));
  console.log(dim(`  host: ${host}   persona: ${persona}`));
  console.log(dim(`  /help for commands · /q to quit\n`));
}

function help() {
  console.log(`
  ${bold("Commands")}
    /p <id>           switch persona   (e.g. /p cro)
    /personas         list all personas
    /ask <text>       run the agent with free-form brief
    /quick <key>      fire a preset         ${dim("(" + Object.keys(QUICK_PROMPTS).join(" / ") + ")")}
    /tasks            list last 10 tasks
    /task <id>        inspect task steps + outputs
    /cache [clear]    cache stats / wipe
    /memory           brand facts + notes + recall
    /fact id=text     upsert a brand fact   (e.g. /fact pricing=99 SAR/mo)
    /note <text>      jot a note on current persona
    /skip             toggle skipCache for next ask (bypass tool cache once)
    /host <url>       repoint at another server
    /q                quit

  ${bold("Tip:")} anything you type that doesn't start with "/" is treated as /ask.
  `);
}

async function runAsk(title: string, body: string, p: string) {
  const started = Date.now();
  process.stdout.write(dim(`  → submitting to ${p}… `));
  const res = await api("/api/agent/run", {
    method: "POST",
    body: JSON.stringify({
      title,
      body,
      persona: p,
      context: skipCacheNext ? { skipCache: true } : {},
    }),
  });
  if (res?.error) {
    console.log(red(`failed: ${res.error}`));
    return;
  }
  const taskId = res?.task?.id || res?.id;
  console.log(green(`ok · task ${taskId}`));
  if (skipCacheNext) {
    skipCacheNext = false;
    console.log(dim("  (skipCache consumed)"));
  }
  if (!taskId) return;
  /* Poll until done or 90s timeout. */
  const until = Date.now() + 90_000;
  let lastStep = 0;
  while (Date.now() < until) {
    await new Promise((r) => setTimeout(r, 900));
    const t = await api(`/api/agent/tasks/${taskId}`);
    const task = t?.task ?? t;
    if (!task) continue;
    const steps = task.steps ?? [];
    for (let i = lastStep; i < steps.length; i++) {
      const s = steps[i];
      const tag =
        s.kind === "tool_use" ? yellow(`⚙ ${s.tool}`) :
        s.kind === "tool_result" ? cyan(`↳ ${s.tool}`) :
        s.kind === "error" ? red("✗") :
        s.kind === "finish" ? green("✓") :
        dim("·");
      const line = (s.message || (s.tool ? "" : "")).toString().split("\n")[0].slice(0, 140);
      console.log(`  ${tag} ${line}`);
    }
    lastStep = steps.length;
    if (task.status === "done" || task.status === "error") {
      console.log(
        dim(`  ${task.status} in ${Math.round((Date.now() - started) / 1000)}s · ${steps.length} steps`),
      );
      if (task.summary) console.log("\n" + task.summary + "\n");
      const outs = task.outputs ?? {};
      const links = Object.entries(outs).filter(
        ([k, v]) => typeof v === "string" && /^(https?:\/\/|drive:|canva:)/i.test(v as string) || /url|link/i.test(k),
      );
      for (const [k, v] of links) console.log(cyan(`  ${k}: `) + v);
      return;
    }
  }
  console.log(dim("  (still running — check /task " + taskId + ")"));
}

async function handle(line: string): Promise<boolean> {
  const raw = line.trim();
  if (!raw) return true;
  if (raw === "/q" || raw === "/quit" || raw === "/exit") return false;
  if (raw === "/help" || raw === "/?") { help(); return true; }

  if (raw.startsWith("/p ")) {
    const next = raw.slice(3).trim();
    const personas = await api("/api/agent/personas");
    const ids = (personas?.personas ?? []).map((p: any) => p.id);
    if (!ids.includes(next)) {
      console.log(red(`unknown persona. available: ${ids.join(", ")}`));
    } else {
      persona = next;
      console.log(green(`persona → ${persona}`));
    }
    return true;
  }

  if (raw === "/personas") {
    const r = await api("/api/agent/personas");
    for (const p of r?.personas ?? []) {
      const marker = p.id === persona ? cyan("●") : " ";
      console.log(`  ${marker} ${bold(p.id.padEnd(20))} ${dim(p.label_en)}`);
    }
    return true;
  }

  if (raw === "/tasks") {
    const r = await api("/api/agent/tasks?limit=10");
    for (const t of (r?.tasks ?? []).slice(0, 10)) {
      const st =
        t.status === "done" ? green(t.status) :
        t.status === "error" ? red(t.status) :
        yellow(t.status);
      console.log(
        `  ${dim(t.id.slice(0, 8))}  ${st.padEnd(16)}  ${dim((t.persona || "?").padEnd(18))} ${
          (t.trigger?.title || t.trigger?.body || "").toString().slice(0, 60)
        }`,
      );
    }
    return true;
  }

  if (raw.startsWith("/task ")) {
    const id = raw.slice(6).trim();
    const r = await api(`/api/agent/tasks/${id}`);
    const t = r?.task ?? r;
    if (!t?.id) { console.log(red("not found")); return true; }
    console.log(bold(`\n  ${t.id} · ${t.status} · ${t.persona}`));
    for (const s of t.steps ?? []) {
      console.log(`  ${dim(s.kind.padEnd(12))} ${s.tool ? yellow(s.tool) + " " : ""}${(s.message || "").slice(0, 160)}`);
    }
    if (t.summary) console.log("\n" + t.summary);
    return true;
  }

  if (raw.startsWith("/cache")) {
    if (raw.includes("clear")) {
      await api("/api/agent/cache/clear", { method: "POST" });
      console.log(green("cache cleared"));
    } else {
      const s = await api("/api/agent/cache/stats");
      console.log(
        `  entries=${s.entries}  hits=${s.hits}  misses=${s.misses}  skips=${s.skips}  hit_rate=${s.hit_rate}  tokens_saved≈${s.tokens_saved_estimate}`,
      );
    }
    return true;
  }

  if (raw === "/memory") {
    const r = await api(`/api/agent/memory?persona=${encodeURIComponent(persona)}`);
    console.log(bold("\n  facts"));
    for (const f of r?.facts ?? []) console.log(`    · ${cyan(f.id)}  ${f.text}`);
    console.log(bold(`\n  notes (${persona})`));
    for (const n of r?.notes ?? []) console.log(`    · ${n.text}`);
    console.log(bold(`\n  recent (${persona})`));
    for (const rc of r?.recall ?? []) console.log(`    · ${rc.title} — ${rc.summary}`);
    return true;
  }

  if (raw.startsWith("/fact ")) {
    const rest = raw.slice(6);
    const eq = rest.indexOf("=");
    if (eq < 0) { console.log(red("format: /fact id=text")); return true; }
    const id = rest.slice(0, eq).trim();
    const text = rest.slice(eq + 1).trim();
    await api("/api/agent/memory/fact", {
      method: "POST",
      body: JSON.stringify({ id, text }),
    });
    console.log(green(`fact saved: ${id}`));
    return true;
  }

  if (raw.startsWith("/note ")) {
    const text = raw.slice(6).trim();
    await api("/api/agent/memory/note", {
      method: "POST",
      body: JSON.stringify({ persona, text }),
    });
    console.log(green(`note saved on ${persona}`));
    return true;
  }

  if (raw === "/skip") {
    skipCacheNext = !skipCacheNext;
    console.log(skipCacheNext ? yellow("next /ask will skip cache") : dim("cache back on"));
    return true;
  }

  if (raw.startsWith("/host ")) {
    host = raw.slice(6).trim();
    console.log(green(`host → ${host}`));
    return true;
  }

  if (raw.startsWith("/quick ")) {
    const key = raw.slice(7).trim();
    const q = QUICK_PROMPTS[key];
    if (!q) { console.log(red(`unknown preset. try: ${Object.keys(QUICK_PROMPTS).join(", ")}`)); return true; }
    await runAsk(q.title, q.body, q.persona);
    return true;
  }

  const body = raw.startsWith("/ask ") ? raw.slice(5).trim() : raw;
  await runAsk(body.slice(0, 60) || "console ask", body, persona);
  return true;
}

async function main() {
  banner();
  /* Ping the server so we fail early if it isn't running. */
  try {
    const r = await api("/api/agent/personas");
    if (!r?.personas) throw new Error(JSON.stringify(r));
  } catch (e) {
    console.log(red(`Can't reach ${host} — is `) + bold("npm run dev") + red(" running?"));
    console.log(dim(String(e)));
  }

  const rl = readline.createInterface({ input, output, prompt: cyan(`${persona}› `) });
  rl.prompt();
  rl.on("line", async (line) => {
    try {
      const cont = await handle(line);
      if (!cont) { rl.close(); return; }
    } catch (e) {
      console.log(red(String(e)));
    }
    rl.setPrompt(cyan(`${persona}${skipCacheNext ? yellow("!") : ""}› `));
    rl.prompt();
  });
  rl.on("close", () => {
    console.log(dim("\nbye."));
    process.exit(0);
  });
}

main();
