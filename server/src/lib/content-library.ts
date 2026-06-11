/**
 * Qoyod Content Library
 *
 * Persistent JSON store of every social/marketing asset Qoyod publishes.
 * Acts as the agent's long-term memory for design direction, copy patterns,
 * channel performance, and competitor benchmarks.
 *
 * Stored at: data/content-library.json
 */

import fs from "fs";
import path from "path";
import { logger } from "./logger.js";
import { sheetsAppendCompetitorPosts, sheetsUpsertContentEntry } from "./sheets-client.js";

const DATA_DIR   = path.resolve(process.cwd(), "data");
const STORE_PATH = path.join(DATA_DIR, "content-library.json");

/* ── Types ─────────────────────────────────────────────────────── */

export interface ContentEntry {
  id: string;                 // broadcast_guid or generated
  type: "post" | "reel" | "story" | "email" | "ad" | "blog" | "other";
  channel: string;            // Instagram / LinkedIn / Facebook / Email / etc.
  published_at: string;       // ISO timestamp
  content_text: string;       // caption / body
  post_url?: string;          // live URL
  thumb_url?: string;         // image/video thumbnail
  media_type?: string;        // VIDEO / IMAGE / TEXT
  topic?: string;             // what product/concept this covers
  funnel?: "TOF" | "MOF" | "BOF"; // funnel stage
  hashtags?: string[];
  tone?: string;              // educational / promotional / community / etc.

  /* Quality scores — filled by agent after analysis */
  quality?: {
    brand_voice: number;      // 1-10
    dialect_correct: boolean;
    hook_strength: number;    // 1-10
    clarity: number;          // 1-10
    notes: string;
  };

  /* Optimization — filled by agent after competitor research */
  optimization?: {
    what_works: string;
    what_to_improve: string;
    competitor_insight: string;
    suggested_variant?: string;
  };

  /** ISO of when the agent last analysed this entry */
  analyzed_at?: string;
}

export interface CompetitorPost {
  competitor: string;         // "Wafeq" / "Sahl" / etc.
  channel: string;
  content_text: string;
  post_url?: string;
  fetched_at: string;
  engagement_hint?: string;
}

interface Library {
  entries: ContentEntry[];
  competitor_posts: CompetitorPost[];
  updated_at: string;
}

/* ── Persistence ────────────────────────────────────────────────── */

function load(): Library {
  try {
    if (!fs.existsSync(STORE_PATH)) return empty();
    const raw = JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
    return {
      entries: Array.isArray(raw.entries) ? raw.entries : [],
      competitor_posts: Array.isArray(raw.competitor_posts) ? raw.competitor_posts : [],
      updated_at: raw.updated_at ?? new Date().toISOString(),
    };
  } catch (e) {
    logger.warn({ err: String(e) }, "content-library: load failed");
    return empty();
  }
}

function empty(): Library {
  return { entries: [], competitor_posts: [], updated_at: new Date().toISOString() };
}

function save(lib: Library) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    lib.updated_at = new Date().toISOString();
    const tmp = STORE_PATH + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(lib, null, 2), "utf8");
    fs.renameSync(tmp, STORE_PATH);
  } catch (e) {
    logger.error({ err: String(e) }, "content-library: save failed");
  }
}

/* ── Public API ─────────────────────────────────────────────────── */

/** Add or update a Qoyod content entry. Returns the saved entry. */
export function upsertEntry(entry: ContentEntry): ContentEntry {
  const lib = load();
  const idx = lib.entries.findIndex((e) => e.id === entry.id);
  let saved: ContentEntry;
  if (idx >= 0) {
    lib.entries[idx] = { ...lib.entries[idx], ...entry };
    saved = lib.entries[idx];
  } else {
    lib.entries.unshift(entry);            // newest first
    if (lib.entries.length > 500) lib.entries = lib.entries.slice(0, 500);
    saved = entry;
  }
  save(lib);
  // Mirror to Google Sheets asynchronously (non-blocking)
  sheetsUpsertContentEntry(saved).catch((e) =>
    logger.warn({ id: saved.id, err: String(e) }, "content-library: sheets sync failed")
  );
  return saved;
}

/** Get entries, optionally filtered by channel or type. Newest first. */
export function listEntries(opts?: {
  channel?: string;
  type?: ContentEntry["type"];
  topic?: string;
  limit?: number;
}): ContentEntry[] {
  const lib = load();
  let results = lib.entries;
  if (opts?.channel) results = results.filter((e) => e.channel.toLowerCase() === opts.channel!.toLowerCase());
  if (opts?.type)    results = results.filter((e) => e.type === opts.type);
  if (opts?.topic)   results = results.filter((e) => (e.topic ?? "").toLowerCase().includes(opts.topic!.toLowerCase()));
  return results.slice(0, opts?.limit ?? 20);
}

/** Get recent competitor posts. */
export function listCompetitorPosts(competitor?: string, limit = 20): CompetitorPost[] {
  const lib = load();
  let results = lib.competitor_posts;
  if (competitor) results = results.filter((p) => p.competitor.toLowerCase() === competitor.toLowerCase());
  return results.slice(0, limit);
}

/** Save competitor posts (deduped by post_url). */
export function saveCompetitorPosts(posts: CompetitorPost[]) {
  const lib = load();
  const newPosts: CompetitorPost[] = [];
  for (const post of posts) {
    const exists = lib.competitor_posts.some(
      (p) => post.post_url && p.post_url === post.post_url
    );
    if (!exists) {
      lib.competitor_posts.unshift(post);
      newPosts.push(post);
    }
  }
  // Keep last 200 competitor posts
  lib.competitor_posts = lib.competitor_posts.slice(0, 200);
  save(lib);
  // Mirror new posts to Google Sheets (non-blocking)
  if (newPosts.length > 0) {
    sheetsAppendCompetitorPosts(newPosts).catch((e) =>
      logger.warn({ err: String(e) }, "content-library: competitor sheets sync failed")
    );
  }
}

/** Update quality/optimization fields on an existing entry. */
export function annotateEntry(
  id: string,
  annotation: Partial<Pick<ContentEntry, "quality" | "optimization" | "analyzed_at" | "topic" | "tone" | "funnel">>
) {
  const lib = load();
  const entry = lib.entries.find((e) => e.id === id);
  if (entry) {
    Object.assign(entry, annotation);
    save(lib);
    // Mirror updated annotation to Sheets
    sheetsUpsertContentEntry(entry).catch((e) =>
      logger.warn({ id, err: String(e) }, "content-library: sheets annotation sync failed")
    );
  }
}

/** Stats summary for the library. */
export function libraryStats() {
  const lib = load();
  const byChannel: Record<string, number> = {};
  for (const e of lib.entries) byChannel[e.channel] = (byChannel[e.channel] ?? 0) + 1;
  return {
    total_entries: lib.entries.length,
    total_competitor_posts: lib.competitor_posts.length,
    by_channel: byChannel,
    latest_entry: lib.entries[0]?.published_at ?? null,
    updated_at: lib.updated_at,
  };
}
