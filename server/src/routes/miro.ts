import { Router, type Request } from "express";
import crypto from "crypto";

const router = Router();

const CLIENT_ID = process.env.MIRO_CLIENT_ID ?? "";
const CLIENT_SECRET = process.env.MIRO_CLIENT_SECRET ?? "";
const STATIC_TOKEN = process.env.MIRO_ACCESS_TOKEN ?? "";
const MIRO_AUTH = "https://miro.com/oauth/authorize";
const MIRO_TOKEN = "https://api.miro.com/v1/oauth/token";
const MIRO_API = "https://api.miro.com/v2";

/* ── in-memory token store ── */
type MiroToken = {
  access_token: string;
  refresh_token?: string;
  expires_at: number;
  team_id?: string;
};
let miroToken: MiroToken | null = STATIC_TOKEN
  ? { access_token: STATIC_TOKEN, expires_at: Date.now() + 365 * 24 * 3600 * 1000 }
  : null;

function getRedirectUri(req: Request): string {
  const rawHost =
    process.env.PUBLIC_HOST ??
    (req.headers["x-forwarded-host"] as string | undefined) ??
    req.headers.host ??
    "localhost:8080";
  if (/^https?:\/\//i.test(rawHost)) {
    return `${rawHost.replace(/\/+$/, "")}/api/miro/callback`;
  }
  const proto =
    (req.headers["x-forwarded-proto"] as string | undefined) ??
    (rawHost.includes("localhost") ? "http" : "https");
  return `${proto}://${rawHost}/api/miro/callback`;
}

router.get("/auth-url", (req, res) => {
  if (!CLIENT_ID) return res.status(500).json({ error: "MIRO_CLIENT_ID not configured" });
  const state = crypto.randomUUID();
  const params = new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID,
    redirect_uri: getRedirectUri(req),
    state,
    scope: "boards:read boards:write",
  });
  res.json({ auth_url: `${MIRO_AUTH}?${params}` });
});

router.get("/callback", async (req, res) => {
  const { code, error } = req.query as Record<string, string>;
  if (error)
    return res.send(
      `<script>window.opener?.postMessage({miro_error:"${error}"},"*");window.close();</script>`
    );
  if (!code)
    return res.send(
      `<script>window.opener?.postMessage({miro_error:"no_code"},"*");window.close();</script>`
    );
  try {
    const redirect_uri = getRedirectUri(req);
    const body = new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri });
    const r = await fetch(MIRO_TOKEN, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64")}`,
      },
      body: body.toString(),
    });
    const data = (await r.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      team_id?: string;
      error?: string;
      error_description?: string;
    };
    if (!r.ok || data.error)
      throw new Error(data.error_description || data.error || "Token exchange failed");
    miroToken = {
      access_token: data.access_token!,
      refresh_token: data.refresh_token,
      expires_at: Date.now() + (data.expires_in ?? 3600) * 1000,
      team_id: data.team_id,
    };
    res.send(`<script>window.opener?.postMessage({miro_ok:true},"*");window.close();</script>`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.send(
      `<script>window.opener?.postMessage({miro_error:"${msg.replace(/"/g, "'")}"},"*");window.close();</script>`
    );
  }
});

router.get("/status", (_req, res) => {
  res.json({ connected: !!miroToken && Date.now() < miroToken.expires_at });
});

router.delete("/logout", (_req, res) => {
  miroToken = STATIC_TOKEN
    ? { access_token: STATIC_TOKEN, expires_at: Date.now() + 365 * 24 * 3600 * 1000 }
    : null;
  res.json({ ok: true });
});

router.post("/create-board", async (req, res) => {
  if (!miroToken) return res.status(401).json({ error: "Not connected to Miro" });
  const { board_name = "Qoyod Creative OS — Workflow" } = req.body as { board_name?: string };
  try {
    const br = await fetch(`${MIRO_API}/boards`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${miroToken.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: board_name }),
    });
    const board = (await br.json()) as { id?: string; viewLink?: string; message?: string };
    if (!br.ok || !board.id) throw new Error(board.message || "Board creation failed");
    const boardId = board.id;
    const viewLink = board.viewLink || `https://miro.com/app/board/${boardId}/`;
    await drawWorkflow(miroToken.access_token, boardId);
    res.json({ ok: true, board_id: boardId, view_link: viewLink });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

router.post("/update-board", async (req, res) => {
  if (!miroToken) return res.status(401).json({ error: "Not connected to Miro" });
  const { board_id, clear = true } = req.body as { board_id?: string; clear?: boolean };
  if (!board_id) return res.status(400).json({ error: "board_id required" });
  try {
    if (clear) await clearArchitectureFrame(miroToken.access_token, board_id, true);
    await drawAgentFlow(miroToken.access_token, board_id);
    res.json({ ok: true, view_link: `https://miro.com/app/board/${board_id}/` });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

/* Draw the CURRENT v2 system architecture onto an existing board.
   Replaces the legacy drawWorkflow which still shows deleted Designer/LP tabs.
   Layout: 7 horizontal layers from top to bottom — Brand Law, Inputs,
   AI Engine, Tabs, Personas, Competitor Pipeline, Self-Learning, Outputs. */
router.post("/draw-system-architecture", async (req, res) => {
  if (!miroToken) return res.status(401).json({ error: "Not connected to Miro" });
  const boardId =
    (req.body as { board_id?: string }).board_id ?? process.env.MIRO_BOARD_ID;
  if (!boardId) return res.status(400).json({ error: "board_id required or set MIRO_BOARD_ID" });
  // Default to false — only wipe the architecture frame, not the whole board
  const clear = (req.body as { clear?: boolean }).clear === true;
  const viewLink = `https://miro.com/app/board/${boardId}/`;

  // Fire-and-forget: drawing 30+ shapes + 22 connectors takes 60-90s
  // (sequential Miro API calls). Railway's edge proxy times out at ~100s,
  // so we return immediately and run the drawing in the background.
  res.status(202).json({
    ok: true,
    accepted: true,
    view_link: viewLink,
    note: "Drawing in background — open the board in 30-60 seconds",
  });

  // eslint-disable-next-line no-console
  console.log("[miro] system architecture render started in background");
  (async () => {
    try {
      await clearArchitectureFrame(miroToken!.access_token, boardId, clear);
      await drawSystemArchitecture(miroToken!.access_token, boardId);
      // eslint-disable-next-line no-console
      console.log("[miro] system architecture render complete");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // eslint-disable-next-line no-console
      console.error("[miro] background render failed:", msg);
    }
  })();
});

/* Draw سمعه agent-specific workflow onto an existing board */
router.post("/draw-agent-flow", async (req, res) => {
  if (!miroToken) return res.status(401).json({ error: "Not connected to Miro" });
  const boardId =
    (req.body as { board_id?: string }).board_id ??
    process.env.MIRO_BOARD_ID;
  if (!boardId) return res.status(400).json({ error: "board_id required or set MIRO_BOARD_ID" });
  try {
    await drawAgentFlow(miroToken.access_token, boardId);
    res.json({ ok: true, view_link: `https://miro.com/app/board/${boardId}/` });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

/* ── Architecture frame name — the only thing we ever auto-delete ── */
const ARCH_FRAME_TITLE = "Qoyod Creative OS — Architecture v3";

/* Find and delete the architecture frame (and everything inside it).
   When forceWipeBoard=true (only via explicit API call), falls back to
   deleting every item — useful for a full reset. All other content the
   team manually adds to the board is always preserved. */
async function clearArchitectureFrame(token: string, boardId: string, forceWipeBoard = false) {
  const hdrs = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  // Find frames with our known title
  const r = await fetch(`${MIRO_API}/boards/${boardId}/frames?limit=50`, { headers: hdrs });
  if (r.ok) {
    const data = (await r.json()) as { data?: { id: string; data?: { title?: string } }[] };
    for (const frame of data.data ?? []) {
      if (frame.data?.title === ARCH_FRAME_TITLE) {
        await fetch(`${MIRO_API}/boards/${boardId}/frames/${frame.id}`, {
          method: "DELETE",
          headers: hdrs,
        }).catch(() => {});
        console.log("[miro] deleted architecture frame:", frame.id);
        return;
      }
    }
  }

  // Frame not found — if forceWipeBoard is explicitly set, wipe everything
  if (forceWipeBoard) {
    let cursor: string | undefined;
    do {
      const url = cursor
        ? `${MIRO_API}/boards/${boardId}/items?limit=50&cursor=${cursor}`
        : `${MIRO_API}/boards/${boardId}/items?limit=50`;
      const pr = await fetch(url, { headers: hdrs });
      if (!pr.ok) break;
      const pd = (await pr.json()) as { data?: { id: string }[]; cursor?: string };
      for (const item of pd.data ?? []) {
        await fetch(`${MIRO_API}/boards/${boardId}/items/${item.id}`, {
          method: "DELETE",
          headers: hdrs,
        }).catch(() => {});
      }
      cursor = pd.cursor;
    } while (cursor);
  }
}

async function drawWorkflow(token: string, boardId: string) {
  const BASE = `${MIRO_API}/boards/${boardId}`;
  const hdrs = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const post = async (path: string, body: object) => {
    const r = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: hdrs,
      body: JSON.stringify(body),
    });
    const d = (await r.json()) as { message?: string; description?: string; id?: string };
    if (!r.ok)
      throw new Error(`${path}: ${d.message || d.description || JSON.stringify(d)}`);
    return d as { id: string };
  };

  const NAVY = "#021544",
    TEAL = "#17A3A4",
    GOLD = "#F5A623",
    PURPLE = "#7D2AE8",
    GREEN = "#22C55E",
    BLUE = "#21759b",
    ORANGE = "#ff7a59",
    YELLOW = "#FFD02F",
    WHITE = "#FFFFFF",
    DARK = "#0f2744";

  const BANNER_W = 1150,
    COL_W = 240,
    COL_H = 70,
    EXP_W = 160,
    EXP_H = 60;
  const C = [-405, -135, 135, 405];
  const E = [-462, -277, -92, 93, 278, 463];

  type Node = {
    id: string;
    x: number;
    y: number;
    w: number;
    h: number;
    label: string;
    fill: string;
    text: string;
  };
  const nodes: Node[] = [
    { id: "title", x: 0, y: 0, w: BANNER_W, h: 65, label: "Qoyod Creative OS  |  نظام تسويق متكامل", fill: NAVY, text: WHITE },
    { id: "brand", x: C[0], y: 130, w: COL_W, h: COL_H, label: "Brand Kit\nالهوية والألوان", fill: TEAL, text: WHITE },
    { id: "prod", x: C[1], y: 130, w: COL_W, h: COL_H, label: "Products  x13\n13 منتجاً", fill: TEAL, text: WHITE },
    { id: "persona", x: C[2], y: 130, w: COL_W, h: COL_H, label: "Audience / ICP\n10 شرائح", fill: TEAL, text: WHITE },
    { id: "intel", x: C[3], y: 130, w: COL_W, h: COL_H, label: "Market Intel\nتحليل المنافسين", fill: TEAL, text: WHITE },
    { id: "ai", x: 0, y: 260, w: BANNER_W, h: 65, label: "Nano Banana AI Engine  |  توليد · تعديل · مراجعة", fill: GOLD, text: NAVY },
    { id: "content", x: C[0], y: 390, w: COL_W, h: COL_H, label: "Content Studio\nنصوص + كابشن A/B", fill: DARK, text: WHITE },
    { id: "design", x: C[1], y: 390, w: COL_W, h: COL_H, label: "Design Studio\nSVG + إعلانات", fill: DARK, text: WHITE },
    { id: "campaigns", x: C[2], y: 390, w: COL_W, h: COL_H, label: "Campaigns + Email\nخطة 360°", fill: DARK, text: WHITE },
    { id: "landing", x: C[3], y: 390, w: COL_W, h: COL_H, label: "Landing Pages\nHTML جاهز للنشر", fill: DARK, text: WHITE },
    { id: "canva", x: E[0], y: 520, w: EXP_W, h: EXP_H, label: "Canva\nExport", fill: PURPLE, text: WHITE },
    { id: "svgdl", x: E[1], y: 520, w: EXP_W, h: EXP_H, label: "SVG\nDownload", fill: GREEN, text: WHITE },
    { id: "miro2", x: E[2], y: 520, w: EXP_W, h: EXP_H, label: "Miro\nWorkflow", fill: YELLOW, text: NAVY },
    { id: "dlhtml", x: E[3], y: 520, w: EXP_W, h: EXP_H, label: "HTML\nDownload", fill: TEAL, text: WHITE },
    { id: "wp", x: E[4], y: 520, w: EXP_W, h: EXP_H, label: "WordPress\nDraft", fill: BLUE, text: WHITE },
    { id: "hs", x: E[5], y: 520, w: EXP_W, h: EXP_H, label: "HubSpot\nPage", fill: ORANGE, text: WHITE },
  ];

  const idMap: Record<string, string> = {};
  for (const n of nodes) {
    const isBanner = n.id === "title" || n.id === "ai";
    const item = await post("/shapes", {
      data: {
        shape: isBanner ? "rectangle" : "round_rectangle",
        content: `<p style="text-align:center"><strong>${n.label.replace(
          /\n/g,
          "</strong><br><strong>"
        )}</strong></p>`,
      },
      style: {
        fillColor: n.fill,
        color: n.text,
        borderColor: n.fill,
        borderWidth: "2",
        fontSize: isBanner ? "16" : "13",
      },
      geometry: { width: n.w, height: n.h },
      position: { x: n.x, y: n.y },
    });
    idMap[n.id] = item.id;
  }

  const conns: [string, string][] = [
    ["brand", "ai"],
    ["prod", "ai"],
    ["persona", "ai"],
    ["intel", "ai"],
    ["ai", "content"],
    ["ai", "design"],
    ["ai", "campaigns"],
    ["ai", "landing"],
    ["design", "canva"],
    ["design", "svgdl"],
    ["campaigns", "miro2"],
    ["landing", "dlhtml"],
    ["landing", "wp"],
    ["landing", "hs"],
  ];

  for (const [from, to] of conns) {
    if (!idMap[from] || !idMap[to]) continue;
    await post("/connectors", {
      startItem: { id: idMap[from] },
      endItem: { id: idMap[to] },
      style: {
        strokeColor: TEAL,
        strokeWidth: "2",
        startStrokeCap: "none",
        endStrokeCap: "arrow",
      },
    }).catch(() => {});
  }
}

/* ── Simplified column flow: APIs → Triggers → Roles → Actions → Outputs ── */
async function drawAgentFlow(token: string, boardId: string) {
  const BASE = `${MIRO_API}/boards/${boardId}`;
  const hdrs = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const post = async (path: string, body: object) => {
    const r = await fetch(`${BASE}${path}`, { method: "POST", headers: hdrs, body: JSON.stringify(body) });
    const d = (await r.json()) as { message?: string; description?: string; id?: string };
    if (!r.ok) throw new Error(`${path}: ${d.message || d.description || JSON.stringify(d)}`);
    return d as { id: string };
  };

  const NAVY = "#021544", TEAL = "#17A3A4", GOLD = "#F5A623";
  const GREEN = "#22C55E", PURPLE = "#7D2AE8", ORANGE = "#ff7a59";
  const DARK = "#0f2744", WHITE = "#FFFFFF", INDIGO = "#4f46e5";
  const BLUE = "#0284c7", PINK = "#db2777";

  /* ── Layout ── */
  const CARD_W = 260;
  const CARD_H = 80;
  const GAP_Y  = 24;   // vertical gap between cards
  const GAP_X  = 140;  // horizontal gap between columns
  const COLS   = 5;
  const TOTAL_W = COLS * CARD_W + (COLS - 1) * GAP_X;
  const X0 = -(TOTAL_W / 2);           // left edge of col 0
  const cx = (col: number) => X0 + col * (CARD_W + GAP_X) + CARD_W / 2;
  const lx = (col: number) => X0 + col * (CARD_W + GAP_X);
  const ry = (row: number) => 220 + row * (CARD_H + GAP_Y);

  type Node = { id: string; col: number; row: number; label: string; sub: string; fill: string };

  /* ── 5 items per column max ── */
  const columns: Node[][] = [
    // Col 0 — APIs / Connectors
    [
      { id: "api_ai",      col: 0, row: 0, label: "Claude + Gemini",    sub: "AI core + image gen",        fill: DARK   },
      { id: "api_social",  col: 0, row: 1, label: "HubSpot + Slack",    sub: "Social, CRM, @mention",      fill: ORANGE },
      { id: "api_publish", col: 0, row: 2, label: "WordPress + Canva",  sub: "Publish & design export",    fill: PURPLE },
      { id: "api_storage", col: 0, row: 3, label: "Google Drive",       sub: "File storage & links",       fill: GREEN  },
      { id: "api_tasks",   col: 0, row: 4, label: "Asana + Miro",       sub: "Tasks & visual boards",      fill: BLUE   },
    ],
    // Col 1 — Triggers
    [
      { id: "tr_ui",       col: 1, row: 0, label: "UI (Quick Form)",    sub: "Manual request in app",      fill: DARK   },
      { id: "tr_mention",  col: 1, row: 1, label: "Slack @mention",     sub: "Direct team request",        fill: "#4A154B" },
      { id: "tr_webhook",  col: 1, row: 2, label: "Webhook / Zapier",   sub: "External automation",        fill: DARK   },
      { id: "tr_hs",       col: 1, row: 3, label: "HubSpot Poller",     sub: "Every 5 min — new posts",    fill: ORANGE },
      { id: "tr_comp",     col: 1, row: 4, label: "Competitor Poller",  sub: "Every 6h — IG/TikTok/X",    fill: PINK   },
    ],
    // Col 2 — Roles (personas)
    [
      { id: "r_designer",  col: 2, row: 0, label: "Designer",           sub: "SVG ads, Canva, images",     fill: TEAL   },
      { id: "r_social",    col: 2, row: 1, label: "Social Media",       sub: "Captions + competitor intel",fill: TEAL   },
      { id: "r_writer",    col: 2, row: 2, label: "Content Writer",     sub: "Copy, blog, Google Ads",     fill: TEAL   },
      { id: "r_cro",       col: 2, row: 3, label: "Email Lifecycle",    sub: "Welcome, nurture, winback",   fill: TEAL   },
      { id: "r_intel",     col: 2, row: 4, label: "Intelligence",       sub: "Library + memory + insights",fill: INDIGO },
    ],
    // Col 3 — Actions (tools)
    [
      { id: "act_content",  col: 3, row: 0, label: "Generate Content",  sub: "Captions, copy, scripts",    fill: DARK   },
      { id: "act_design",   col: 3, row: 1, label: "Generate Design",   sub: "SVG ads + AI images",        fill: DARK   },
      { id: "act_page",     col: 3, row: 2, label: "Build Page / Email",sub: "Landing page + sequences",   fill: DARK   },
      { id: "act_campaign", col: 3, row: 3, label: "Build Campaign",    sub: "360° plan + RSA + A/B",      fill: DARK   },
      { id: "act_intel",    col: 3, row: 4, label: "Intel & Memory",    sub: "Competitors + library + memory", fill: INDIGO },
    ],
    // Col 4 — Outputs
    [
      { id: "out_canva",   col: 4, row: 0, label: "Canva Design",       sub: "Ready to edit & publish",    fill: PURPLE },
      { id: "out_social",  col: 4, row: 1, label: "HubSpot / Slack",    sub: "Published post or reply",    fill: ORANGE },
      { id: "out_web",     col: 4, row: 2, label: "WordPress",          sub: "Draft page or blog post",    fill: BLUE   },
      { id: "out_drive",   col: 4, row: 3, label: "Google Drive",       sub: "File + shareable link",      fill: GREEN  },
      { id: "out_memory",  col: 4, row: 4, label: "Library & Memory",   sub: "Stored for future tasks",    fill: INDIGO },
    ],
  ];

  const COL_LABELS = [
    "APIs / Connectors", "Triggers", "Roles", "Actions", "Outputs",
  ];
  const COL_FILLS = [DARK, "#0c2f52", "#0c2f52", "#0c2f52", "#0c2f52"];

  /* ── Build nodes list ── */
  type ShapeNode = {
    id: string; x: number; y: number; w: number; h: number;
    label: string; fill: string; text: string;
    shape: "rectangle" | "round_rectangle"; fontSize: string;
  };
  const nodes: ShapeNode[] = [];

  // Title banner
  nodes.push({
    id: "title", x: X0, y: -120, w: TOTAL_W, h: 64,
    label: "Qoyod Creative OS  —  نظام الذكاء التسويقي",
    fill: NAVY, text: WHITE, shape: "rectangle", fontSize: "18",
  });
  // Sub-banner
  nodes.push({
    id: "sub", x: X0, y: -46, w: TOTAL_W, h: 40,
    label: "Claude Sonnet 4.5  ·  persona routing  ·  long-term memory  ·  cache",
    fill: GOLD, text: NAVY, shape: "rectangle", fontSize: "13",
  });

  // Column headers
  for (let c = 0; c < COLS; c++) {
    nodes.push({
      id: `h${c}`, x: lx(c), y: 140, w: CARD_W, h: 56,
      label: COL_LABELS[c],
      fill: COL_FILLS[c], text: TEAL, shape: "round_rectangle", fontSize: "14",
    });
  }

  // Cards
  for (const col of columns) {
    for (const n of col) {
      nodes.push({
        id: n.id, x: lx(n.col), y: ry(n.row), w: CARD_W, h: CARD_H,
        label: `${n.label}\n${n.sub}`,
        fill: n.fill, text: WHITE, shape: "round_rectangle", fontSize: "12",
      });
    }
  }

  /* ── Create all shapes ── */
  const idMap: Record<string, string> = {};
  for (const n of nodes) {
    const item = await post("/shapes", {
      data: {
        shape: n.shape,
        content: `<p style="text-align:center"><strong>${n.label.split("\n")[0]}</strong>${
          n.label.includes("\n") ? `<br><span style="font-size:10px;opacity:0.85">${n.label.split("\n")[1]}</span>` : ""
        }</p>`,
      },
      style: {
        fillColor: n.fill,
        color: n.text,
        borderColor: n.fill,
        borderWidth: n.shape === "rectangle" ? "3" : "2",
        fontSize: n.fontSize,
      },
      geometry: { width: n.w, height: n.h },
      position: { x: n.x, y: n.y },
    });
    idMap[n.id] = item.id;
  }

  /* ── Connectors — one per logical link only ── */
  const connect = async (a: string, b: string, colour = TEAL, dashed = false) => {
    if (!idMap[a] || !idMap[b]) return;
    await post("/connectors", {
      startItem: { id: idMap[a] },
      endItem:   { id: idMap[b] },
      style: { strokeColor: colour, strokeWidth: "2",
               strokeStyle: dashed ? "dashed" : "normal",
               startStrokeCap: "none", endStrokeCap: "arrow" },
    }).catch(() => {});
  };

  // APIs → Triggers (5 clean 1:1 links)
  await connect("api_ai",      "tr_ui",      TEAL);
  await connect("api_social",  "tr_mention", "#4A154B");
  await connect("api_social",  "tr_hs",      ORANGE);
  await connect("api_ai",      "tr_comp",    PINK, true);
  await connect("api_tasks",   "tr_webhook", BLUE);

  // Triggers → Roles (5 clean links)
  await connect("tr_ui",      "r_designer", TEAL);
  await connect("tr_mention", "r_social",   TEAL);
  await connect("tr_webhook", "r_writer",   TEAL);
  await connect("tr_hs",      "r_social",   ORANGE);
  await connect("tr_comp",    "r_intel",    PINK, true);

  // Roles → Actions (5 clean links)
  await connect("r_designer", "act_design",   TEAL);
  await connect("r_social",   "act_content",  TEAL);
  await connect("r_writer",   "act_page",     TEAL);
  await connect("r_cro",      "act_campaign", TEAL);
  await connect("r_intel",    "act_intel",    INDIGO);

  // Actions → Outputs (5 clean links)
  await connect("act_design",   "out_canva",  PURPLE);
  await connect("act_content",  "out_social", ORANGE);
  await connect("act_page",     "out_web",    BLUE);
  await connect("act_campaign", "out_drive",  GREEN);
  await connect("act_intel",    "out_memory", INDIGO);
}

/* ── Designer Pipeline — 5-step diagram of the AI graphic-designer flow ──
   Reflects the actual production architecture:
     1. Brief inputs
     2. Claude (loaded with Playbook + Ads Guideline + Headline patterns)
        → outputs Arabic copy + scene-only English image prompt
     3. AI image model (GPT-Image-1 / Nano Banana) → paints scene only
     4. Satori typography compositor (Lama Sans → IBM Plex fallback)
        → composites brand mark, ZATCA badge, CTA, qoyod.com on top
     5. Outputs (PNG / JPG / Drive / Open in Canva) */
async function drawDesignerPipeline(token: string, boardId: string) {
  const BASE = `${MIRO_API}/boards/${boardId}`;
  const hdrs = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const post = async (path: string, body: object) => {
    const r = await fetch(`${BASE}${path}`, { method: "POST", headers: hdrs, body: JSON.stringify(body) });
    const d = (await r.json()) as { message?: string; description?: string; id?: string };
    if (!r.ok) throw new Error(`${path}: ${d.message || d.description || JSON.stringify(d)}`);
    return d as { id: string };
  };

  const NAVY = "#021544", TEAL = "#17A3A4", CYAN = "#1FCACB";
  const GOLD = "#F5A623", GREEN = "#22C55E", PURPLE = "#7D2AE8";
  const DARK = "#0f2744", WHITE = "#FFFFFF";

  /* Layout — five columns left to right (Brief → Claude → AI Image → Compositor → Outputs)
     Painted into a fresh region so it doesn't overlap any existing diagrams. */
  const STEP_W = 280, STEP_H = 100, GAP_X = 110;
  const COLS = 5;
  const TOTAL_W = COLS * STEP_W + (COLS - 1) * GAP_X;
  const X0 = 1500;            // sit to the right of any existing content
  const Y_TITLE = -2000;
  const Y_HEADER = Y_TITLE + 120;
  const Y_STEP = Y_HEADER + 110;
  const Y_DETAIL_START = Y_STEP + STEP_H + 40;
  const cx = (col: number) => X0 + col * (STEP_W + GAP_X) + STEP_W / 2;
  const lx = (col: number) => X0 + col * (STEP_W + GAP_X);

  type Node = { id: string; x: number; y: number; w: number; h: number; label: string; sub?: string; fill: string; text: string; shape: "rectangle" | "round_rectangle"; font: string };
  const nodes: Node[] = [];

  /* Title banner */
  nodes.push({
    id: "dp_title", x: X0, y: Y_TITLE, w: TOTAL_W, h: 80,
    label: "Qoyod Designer Pipeline",
    sub: "AI Graphic Designer  ·  Hybrid AI scene + typography composition",
    fill: NAVY, text: WHITE, shape: "rectangle", font: "20",
  });

  /* Column headers */
  const headers = [
    { id: "h_brief", label: "1 · BRIEF", fill: DARK },
    { id: "h_claude", label: "2 · CLAUDE", fill: GOLD },
    { id: "h_ai", label: "3 · AI IMAGE", fill: PURPLE },
    { id: "h_typo", label: "4 · TYPOGRAPHY", fill: TEAL },
    { id: "h_out", label: "5 · OUTPUT", fill: GREEN },
  ];
  headers.forEach((h, c) => {
    nodes.push({
      id: h.id, x: lx(c), y: Y_HEADER, w: STEP_W, h: 60,
      label: h.label, fill: h.fill, text: WHITE, shape: "rectangle", font: "16",
    });
  });

  /* Main step cards */
  const steps: Array<{id: string; title: string; sub: string; col: number; fill: string}> = [
    { id: "s_brief",  title: "Brief Inputs",          sub: "product · message · hook · ratio · channel · scheme · provider", col: 0, fill: DARK },
    { id: "s_claude", title: "Claude — Brain",        sub: "loaded with Playbook + Ads Guideline + Headline Patterns",       col: 1, fill: GOLD },
    { id: "s_ai",     title: "AI Image — Painter",    sub: "GPT-Image-1 (default) · Nano Banana (alt) · scene only",         col: 2, fill: PURPLE },
    { id: "s_typo",   title: "Compositor — Layout",   sub: "Satori + Lama Sans  ·  brand · ZATCA · CTA · qoyod.com",         col: 3, fill: TEAL },
    { id: "s_out",    title: "Final Design",          sub: "PNG / JPG / Drive / Open in Canva",                              col: 4, fill: GREEN },
  ];
  steps.forEach((s) => {
    nodes.push({
      id: s.id, x: lx(s.col), y: Y_STEP, w: STEP_W, h: STEP_H,
      label: s.title, sub: s.sub, fill: s.fill, text: WHITE,
      shape: "round_rectangle", font: "15",
    });
  });

  /* Detail cards under each step (3 per step, stacked) */
  const details: Array<{id: string; col: number; row: number; label: string; sub: string; fill: string}> = [
    /* Brief details */
    { id: "d_brief_1", col: 0, row: 0, label: "Product / Message", sub: "what & for whom", fill: DARK },
    { id: "d_brief_2", col: 0, row: 1, label: "Channel & Ratio",   sub: "1:1 · 4:5 · 9:16 · 16:9", fill: DARK },
    { id: "d_brief_3", col: 0, row: 2, label: "Image Provider",    sub: "auto · Nano Banana · GPT-Image", fill: DARK },

    /* Claude details */
    { id: "d_claude_1", col: 1, row: 0, label: "Arabic Copy",        sub: "headline 5-7 words · hook · CTA · trust · tagline", fill: GOLD },
    { id: "d_claude_2", col: 1, row: 1, label: "Scene Prompt (EN)",  sub: "250-400 words · lens · light · hex · NO text",      fill: GOLD },
    { id: "d_claude_3", col: 1, row: 2, label: "Headline Pattern",   sub: "question · command · outcome · sector formula",      fill: GOLD },

    /* AI image details */
    { id: "d_ai_1", col: 2, row: 0, label: "GPT-Image-1",     sub: "editorial · product UI · sharp", fill: PURPLE },
    { id: "d_ai_2", col: 2, row: 1, label: "Nano Banana",     sub: "cinematic · volumetric · atmospheric", fill: PURPLE },
    { id: "d_ai_3", col: 2, row: 2, label: "No Text in Image",sub: "leaves clean space for typography", fill: PURPLE },

    /* Typography compositor details */
    { id: "d_typo_1", col: 3, row: 0, label: "Brand Mark",      sub: "قيود + QOYOD bilingual · cyan #17A3A4", fill: TEAL },
    { id: "d_typo_2", col: 3, row: 1, label: "Headline + Hook", sub: "Lama Sans · RTL · drop-shadow", fill: TEAL },
    { id: "d_typo_3", col: 3, row: 2, label: "ZATCA + CTA",     sub: "هيئة الزكاة والضريبة  ·  اشترك الآن", fill: TEAL },

    /* Output details */
    { id: "d_out_1", col: 4, row: 0, label: "PNG / JPG",     sub: "1080×1080 · 1080×1350 · 1080×1920 · 1920×1080", fill: GREEN },
    { id: "d_out_2", col: 4, row: 1, label: "Save to Drive", sub: "auto-organized in Creative OS folder", fill: GREEN },
    { id: "d_out_3", col: 4, row: 2, label: "Open in Canva", sub: "deep-link · no OAuth · drag-in flow", fill: GREEN },
  ];
  const DETAIL_H = 70, DETAIL_GAP = 14;
  details.forEach((d) => {
    nodes.push({
      id: d.id, x: lx(d.col), y: Y_DETAIL_START + d.row * (DETAIL_H + DETAIL_GAP), w: STEP_W, h: DETAIL_H,
      label: d.label, sub: d.sub, fill: d.fill, text: WHITE,
      shape: "round_rectangle", font: "12",
    });
  });

  /* Reference example footer — the macro phone prompt that sets the bar */
  nodes.push({
    id: "ref_example", x: X0, y: Y_DETAIL_START + 3 * (DETAIL_H + DETAIL_GAP) + 30, w: TOTAL_W, h: 100,
    label: "Reference scene-prompt style",
    sub: "Editorial product photography · Canon 50mm f/2.0 · navy #021544 + cyan #17A3A4 rim light · empty right side for typography · no text in image",
    fill: NAVY, text: CYAN, shape: "round_rectangle", font: "12",
  });

  const idMap: Record<string, string> = {};
  for (const n of nodes) {
    const item = await post("/shapes", {
      data: {
        shape: n.shape,
        content: `<p style="text-align:center"><strong>${n.label}</strong>${
          n.sub ? `<br><span style="font-size:11px;opacity:0.85">${n.sub}</span>` : ""
        }</p>`,
      },
      style: {
        fillColor: n.fill, color: n.text, borderColor: n.fill,
        borderWidth: n.shape === "rectangle" ? "3" : "2",
        fontSize: n.font,
      },
      geometry: { width: n.w, height: n.h },
      position: { x: n.x, y: n.y },
    });
    idMap[n.id] = item.id;
  }

  /* Connectors — horizontal flow between the 5 main steps */
  const connect = async (a: string, b: string, color = TEAL) => {
    if (!idMap[a] || !idMap[b]) return;
    await post("/connectors", {
      startItem: { id: idMap[a] },
      endItem: { id: idMap[b] },
      style: { strokeColor: color, strokeWidth: "3", startStrokeCap: "none", endStrokeCap: "arrow" },
    }).catch(() => {});
  };
  await connect("s_brief",  "s_claude", TEAL);
  await connect("s_claude", "s_ai",     GOLD);
  await connect("s_ai",     "s_typo",   PURPLE);
  await connect("s_typo",   "s_out",    TEAL);
}

/* Delete only the designer pipeline diagram (items in its drawn region OR
   whose content matches a known pipeline label). Leaves everything else
   on the board untouched. */
async function cleanupDesignerPipeline(token: string, boardId: string): Promise<number> {
  const hdrs = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  // Region we drew into (matches drawDesignerPipeline geometry — see above).
  const REGION = { xMin: 1400, xMax: 3500, yMin: -2200, yMax: -1100 };
  const PIPELINE_LABELS = new Set([
    "Qoyod Designer Pipeline",
    "1 · BRIEF", "2 · CLAUDE", "3 · AI IMAGE", "4 · TYPOGRAPHY", "5 · OUTPUT",
    "Brief Inputs", "Claude — Brain", "AI Image — Painter", "Compositor — Layout", "Final Design",
    "Product / Message", "Channel & Ratio", "Image Provider",
    "Arabic Copy", "Scene Prompt (EN)", "Headline Pattern",
    "GPT-Image-1", "Nano Banana", "No Text in Image",
    "Brand Mark", "Headline + Hook", "ZATCA + CTA",
    "PNG / JPG", "Save to Drive", "Open in Canva",
    "Reference scene-prompt style",
  ]);

  let cursor: string | undefined;
  let deleted = 0;
  do {
    const url = cursor
      ? `${MIRO_API}/boards/${boardId}/items?limit=50&cursor=${cursor}`
      : `${MIRO_API}/boards/${boardId}/items?limit=50`;
    const r = await fetch(url, { headers: hdrs });
    if (!r.ok) break;
    const data = (await r.json()) as {
      data?: Array<{
        id: string;
        type?: string;
        position?: { x?: number; y?: number };
        data?: { content?: string };
      }>;
      cursor?: string;
    };
    const items = data.data ?? [];
    for (const item of items) {
      const x = item.position?.x ?? 0;
      const y = item.position?.y ?? 0;
      const inRegion =
        x >= REGION.xMin && x <= REGION.xMax &&
        y >= REGION.yMin && y <= REGION.yMax;
      const labelHit = !!Array.from(PIPELINE_LABELS).find((l) =>
        (item.data?.content ?? "").includes(l),
      );
      if (inRegion || labelHit) {
        await fetch(`${MIRO_API}/boards/${boardId}/items/${item.id}`, {
          method: "DELETE",
          headers: hdrs,
        }).catch(() => {});
        deleted++;
      }
    }
    cursor = data.cursor;
  } while (cursor);
  return deleted;
}

/* POST /api/miro/cleanup-designer-pipeline — removes ONLY the pipeline
   diagram (by region + content match), leaving the rest of the board
   untouched. */
router.post("/cleanup-designer-pipeline", async (req, res) => {
  if (!miroToken) return res.status(401).json({ error: "Not connected to Miro" });
  const boardId =
    (req.body as { board_id?: string }).board_id ??
    process.env.MIRO_BOARD_ID;
  if (!boardId) return res.status(400).json({ error: "board_id required" });
  try {
    const count = await cleanupDesignerPipeline(miroToken.access_token, boardId);
    res.json({ ok: true, deleted: count, view_link: `https://miro.com/app/board/${boardId}/` });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

/* POST /api/miro/draw-designer-pipeline — adds the 5-step designer flow
   to an existing board. Pass { board_id } in body or set MIRO_BOARD_ID. */
router.post("/draw-designer-pipeline", async (req, res) => {
  if (!miroToken) return res.status(401).json({ error: "Not connected to Miro" });
  const boardId =
    (req.body as { board_id?: string }).board_id ??
    process.env.MIRO_BOARD_ID;
  if (!boardId) return res.status(400).json({ error: "board_id required" });
  try {
    await drawDesignerPipeline(miroToken.access_token, boardId);
    res.json({ ok: true, view_link: `https://miro.com/app/board/${boardId}/` });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

/* ─── v2 System Architecture (current state, post-Designer-removal) ──────
   Renders the closed-loop creative operator on a Miro board.
   Layers from top to bottom:
     1. BRAND LAW (always-on, prepends every prompt)
     2. INPUTS (Quick Agent, Master Prompt, Competitor Context)
     3. AI ENGINE (3-provider fallback)
     4. TABS (7 active production surfaces)
     5. PERSONAS (6 roles)
     6. COMPETITOR INTEL PIPELINE (4 sources → analysis)
     7. SELF-LEARNING LOOP (hypothesis ledger, weekly review)
     8. OUTPUTS (Slack, Sheet, Doc, Asana)
   Connectors show data flow. */
async function drawSystemArchitecture(token: string, boardId: string) {
  const BASE = `${MIRO_API}/boards/${boardId}`;
  const hdrs = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  // Create the named architecture frame first.
  // All items will be children of this frame so future re-renders
  // only ever delete this frame — never touching the rest of the board.
  const FRAME_W = 1700;
  const FRAME_H = 1600;
  const FRAME_X = 0;   // centre of board
  const FRAME_Y = 0;
  const frameRes = await fetch(`${BASE}/frames`, {
    method: "POST",
    headers: hdrs,
    body: JSON.stringify({
      data: { title: ARCH_FRAME_TITLE, format: "custom", type: "freeform" },
      style: { fillColor: "#021030" },
      position: { x: FRAME_X, y: FRAME_Y, origin: "center" },
      geometry: { width: FRAME_W, height: FRAME_H },
    }),
  });
  const frameData = (await frameRes.json()) as { id?: string; message?: string };
  if (!frameRes.ok) throw new Error(`frame: ${frameData.message || JSON.stringify(frameData)}`);
  const frameId = frameData.id!;

  const post = async (path: string, body: object) => {
    // Inject parent frame into every item so they live inside the frame
    const enriched = { ...(body as Record<string, unknown>), parent: { id: frameId } };
    const r = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: hdrs,
      body: JSON.stringify(enriched),
    });
    const d = (await r.json()) as { message?: string; description?: string; id?: string };
    if (!r.ok) throw new Error(`${path}: ${d.message || d.description || JSON.stringify(d)}`);
    return d as { id: string };
  };

  // Palette
  const NAVY = "#021544",
    TEAL = "#17A3A4",
    GOLD = "#F5A623",
    PURPLE = "#7D2AE8",
    GREEN = "#22C55E",
    BLUE = "#0F76C9",
    ORANGE = "#FF7A2A",
    RED = "#DC2626",
    DARK = "#0f2744",
    WHITE = "#FFFFFF";

  // Layout
  const W = 1500;
  const COL_W = 200;
  const COL_H = 60;
  const BANNER_H = 55;
  const Y_BRAND = -800;
  const Y_INPUTS = -650;
  const Y_AI_BAR = -510;
  const Y_AI = -440;
  const Y_TABS = -270;
  const Y_PERS = -130;
  const Y_INTEL_BAR = 30;
  const Y_INTEL = 110;
  const Y_LOOP = 270;
  const Y_OUT_BAR = 410;
  const Y_OUT = 480;

  const cols = (n: number, span = W) => {
    const step = span / (n + 1);
    return Array.from({ length: n }, (_, i) => -span / 2 + step * (i + 1));
  };

  type N = { id: string; x: number; y: number; w: number; h: number; label: string; fill: string; text: string };
  const nodes: N[] = [];

  // Layer 0 — title
  nodes.push({
    id: "title",
    x: 0,
    y: Y_BRAND - 90,
    w: W,
    h: BANNER_H,
    label: "Qoyod Creative OS v2  |  Self-Learning Closed-Loop Operator",
    fill: NAVY,
    text: WHITE,
  });

  // Layer 1 — BRAND LAW (single golden bar)
  nodes.push({
    id: "law",
    x: 0,
    y: Y_BRAND,
    w: W,
    h: BANNER_H,
    label: "BRAND LAW (auto-injected) · Saudi dialect · ONE message=ONE CTA=ONE trust · Hard stops · No design exec, no LP",
    fill: GOLD,
    text: NAVY,
  });

  // Layer 2 — KNOWLEDGE FEEDS (5 auto-injected sources of truth)
  const xIn = cols(5);
  nodes.push({ id: "qa", x: xIn[0], y: Y_INPUTS, w: COL_W, h: COL_H, label: "Quick Agent\nfree-form prompt", fill: TEAL, text: WHITE });
  nodes.push({ id: "master", x: xIn[1], y: Y_INPUTS, w: COL_W, h: COL_H, label: "Brand Law\nMaster Prompt v1.1", fill: TEAL, text: WHITE });
  nodes.push({ id: "ctx", x: xIn[2], y: Y_INPUTS, w: COL_W, h: COL_H, label: "Competitor Context\n(D4: weighted by longevity)", fill: TEAL, text: WHITE });
  nodes.push({ id: "voice", x: xIn[3], y: Y_INPUTS, w: COL_W, h: COL_H, label: "Customer Voice\n(D2: App Store + X)", fill: GOLD, text: NAVY });
  nodes.push({ id: "zatca", x: xIn[4], y: Y_INPUTS, w: COL_W, h: COL_H, label: "ZATCA Intel\n(D3: news + deadlines)", fill: GOLD, text: NAVY });

  // Layer 3 — AI ENGINE (header bar + 3 providers + reliability stack)
  nodes.push({ id: "ai_bar", x: 0, y: Y_AI_BAR, w: W, h: BANNER_H, label: "AI ENGINE  ·  3-Provider Fallback  +  Retry  +  Dedup  +  Health Probe", fill: NAVY, text: WHITE });
  const xAi = cols(3);
  nodes.push({ id: "anth", x: xAi[0], y: Y_AI, w: COL_W + 60, h: COL_H, label: "Anthropic Sonnet 4.5\nprimary · 3 retries", fill: PURPLE, text: WHITE });
  nodes.push({ id: "oai", x: xAi[1], y: Y_AI, w: COL_W + 60, h: COL_H, label: "OpenAI gpt-4o-mini\nfallback 1", fill: GREEN, text: WHITE });
  nodes.push({ id: "gem", x: xAi[2], y: Y_AI, w: COL_W + 60, h: COL_H, label: "Gemini 2.5 Flash\nfallback 2", fill: BLUE, text: WHITE });

  // Layer 4 — TABS (7 active)
  const tabs = [
    { id: "tab_content", label: "Content\n1-5 variants" },
    { id: "tab_camp", label: "Campaign\nmulti-channel" },
    { id: "tab_cal", label: "Calendar\nmonthly plan" },
    { id: "tab_email", label: "Email & WA\nsequences" },
    { id: "tab_market", label: "Market Watch\ncounter-creative" },
    { id: "tab_lib", label: "Ad Library\nswipe file" },
    { id: "tab_icp", label: "ICP\npersonas" },
  ];
  const xT = cols(tabs.length);
  tabs.forEach((t, i) => nodes.push({ id: t.id, x: xT[i], y: Y_TABS, w: 175, h: COL_H, label: t.label, fill: DARK, text: WHITE }));

  // Layer 5 — PERSONAS (6 roles)
  const personas = [
    { id: "p_social", label: "Social Media\nanalysis+monitor" },
    { id: "p_content", label: "Content Creator\ncopy+captions" },
    { id: "p_email2", label: "Email Lifecycle\nwelcome+nurture" },
    { id: "p_email", label: "Email Lifecycle\nsequences" },
    { id: "p_qa", label: "Editor QA\nchecklist" },
    { id: "p_orch", label: "Orchestrator\nrouter" },
  ];
  const xP = cols(personas.length);
  personas.forEach((p, i) => nodes.push({ id: p.id, x: xP[i], y: Y_PERS, w: COL_W, h: COL_H, label: p.label, fill: TEAL, text: WHITE }));

  // Layer 6 — COMPETITOR INTEL (header bar + 4 sources + 1 synthesizer)
  nodes.push({ id: "intel_bar", x: 0, y: Y_INTEL_BAR, w: W, h: BANNER_H, label: "COMPETITOR INTELLIGENCE PIPELINE  ·  Sunday 09:00 UTC", fill: NAVY, text: WHITE });
  const sources = [
    { id: "s_fb", label: "Facebook Ads\nApify Library" },
    { id: "s_ig", label: "Instagram\norganic posts" },
    { id: "s_g", label: "Google Ads\nTransparency" },
    { id: "s_yt", label: "YouTube\nData API v3" },
    { id: "s_synth", label: "Context Synth\n→ inject in prompts" },
  ];
  const xS = cols(sources.length);
  sources.forEach((s, i) =>
    nodes.push({ id: s.id, x: xS[i], y: Y_INTEL, w: COL_W + 30, h: COL_H, label: s.label, fill: ORANGE, text: WHITE }),
  );

  // Layer 7 — SELF-LEARNING LOOP
  const loop = [
    { id: "l_hyp", label: "Hypothesis Ledger\nLog as Test → Sheet" },
    { id: "l_pattern", label: "Pattern Library (D1)\nWINs → few-shot prompts" },
    { id: "l_anti", label: "Anti-Pattern Lib\nlosses → guardrails" },
    { id: "l_review", label: "Weekly Self-Review\nMon AM" },
  ];
  const xL = cols(loop.length);
  loop.forEach((l, i) => nodes.push({ id: l.id, x: xL[i], y: Y_LOOP, w: COL_W + 60, h: COL_H, label: l.label, fill: PURPLE, text: WHITE }));

  // Layer 8 — OUTPUTS
  nodes.push({ id: "out_bar", x: 0, y: Y_OUT_BAR, w: W, h: BANNER_H, label: "OUTPUTS  ·  Reports + Records + Hand-offs", fill: NAVY, text: WHITE });
  const outs = [
    { id: "o_slack", label: "Slack\nweekly + alerts" },
    { id: "o_sheet", label: "Google Sheet\nposts + ledger" },
    { id: "o_doc", label: "Google Doc\nweekly visual" },
    { id: "o_asana", label: "Asana\ntask creation" },
  ];
  const xO = cols(outs.length);
  outs.forEach((o, i) => nodes.push({ id: o.id, x: xO[i], y: Y_OUT, w: COL_W + 60, h: COL_H, label: o.label, fill: RED, text: WHITE }));

  // Render shapes
  const idMap: Record<string, string> = {};
  for (const n of nodes) {
    const isBanner = ["title", "law", "ai_bar", "intel_bar", "out_bar"].includes(n.id);
    const item = await post("/shapes", {
      data: {
        shape: isBanner ? "rectangle" : "round_rectangle",
        content: `<p style="text-align:center"><strong>${n.label.replace(/\n/g, "</strong><br><strong>")}</strong></p>`,
      },
      style: {
        fillColor: n.fill,
        color: n.text,
        borderColor: n.fill,
        borderWidth: "2",
        fontSize: isBanner ? "16" : "12",
      },
      geometry: { width: n.w, height: n.h },
      position: { x: n.x, y: n.y },
    });
    idMap[n.id] = item.id;
  }

  // Connectors — show data flow (subset, key arrows only)
  const conns: Array<[string, string]> = [
    // All 5 knowledge feeds converge into AI engine
    ["qa", "ai_bar"],
    ["master", "ai_bar"],
    ["ctx", "ai_bar"],
    ["voice", "ai_bar"],
    ["zatca", "ai_bar"],
    // AI engine fans out to tabs
    ["anth", "tab_content"],
    ["anth", "tab_camp"],
    ["anth", "tab_cal"],
    ["anth", "tab_email"],
    // Personas serve tabs (one representative arrow)
    ["p_content", "tab_content"],
    ["p_social", "tab_market"],
    ["p_cro", "tab_market"],
    ["p_email", "tab_email"],
    // Intel pipeline → context synth → context node
    ["s_fb", "s_synth"],
    ["s_ig", "s_synth"],
    ["s_g", "s_synth"],
    ["s_yt", "s_synth"],
    ["s_synth", "ctx"],
    // Self-learning loop — closes back into the Pattern Library knowledge feed
    ["tab_content", "l_hyp"],
    ["l_hyp", "l_pattern"],
    ["l_pattern", "ai_bar"], // ← THE LOOP: winners feed next generation
    ["l_review", "l_pattern"],
    ["l_review", "l_anti"],
    // Outputs from intel pipeline
    ["s_synth", "o_slack"],
    ["s_synth", "o_doc"],
    ["s_synth", "o_sheet"],
    // Hypothesis logged to sheet
    ["l_hyp", "o_sheet"],
  ];

  for (const [from, to] of conns) {
    if (!idMap[from] || !idMap[to]) continue;
    await post("/connectors", {
      startItem: { id: idMap[from] },
      endItem: { id: idMap[to] },
      style: {
        strokeColor: TEAL,
        strokeWidth: "2",
        startStrokeCap: "none",
        endStrokeCap: "arrow",
      },
    }).catch(() => {});
  }
}

export default router;
