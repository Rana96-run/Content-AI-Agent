import { Router } from "express";
import { google } from "googleapis";
import { Readable } from "stream";
import fs from "fs";
import path from "path";
import os from "os";

const router = Router();

/* ───────────────────────────────────────────────
   Google Drive integration via service account.
   Env:
     GOOGLE_SERVICE_ACCOUNT_JSON = <inline JSON string>  (preferred, path-free)
     — or —
     GOOGLE_APPLICATION_CREDENTIALS = /absolute/path/to/key.json
     GOOGLE_DRIVE_FOLDER_ID        = target folder id (required)
   The service account must be given Editor access to the Drive folder.
   ─────────────────────────────────────────────── */

const FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID ?? "";

/** Robustly parse the service-account JSON regardless of how it was set.
 *  Handles: extra surrounding quotes, escaped newlines in private_key,
 *  and single-quoted JS objects (from some shells). */
function parseServiceAccountJson(raw: string): object {
  let s = raw.trim();
  // Strip surrounding double-quotes if the whole value was JSON-stringified
  if (s.startsWith('"') && s.endsWith('"')) {
    try { s = JSON.parse(s) as string; } catch { /* keep original */ }
  }
  // Normalise escaped newlines in private_key (\n → actual newline)
  s = s.replace(/\\n/g, "\n");
  return JSON.parse(s);
}

/** Write service-account JSON to a temp file and return its path.
 *  Used as fallback when GoogleAuth can't accept the inline credentials. */
function writeCredsTempFile(creds: object): string {
  const p = path.join(os.tmpdir(), "gsa_key.json");
  fs.writeFileSync(p, JSON.stringify(creds), "utf8");
  return p;
}

function getServiceAccountCreds(): object | null {
  // Priority 1: base64-encoded (no newline corruption possible)
  const b64 = process.env.GOOGLE_SERVICE_ACCOUNT_B64;
  if (b64) {
    try {
      const decoded = Buffer.from(b64, "base64").toString("utf8");
      return JSON.parse(decoded);
    } catch { /* fall through */ }
  }
  // Priority 2: raw inline JSON
  const inline = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (inline) {
    try { return parseServiceAccountJson(inline); } catch { /* fall through */ }
  }
  return null;
}

function getDriveClient() {
  const scopes = ["https://www.googleapis.com/auth/drive"];
  const creds = getServiceAccountCreds();
  let auth;
  if (creds) {
    try {
      auth = new google.auth.GoogleAuth({ credentials: creds, scopes });
    } catch {
      // Fallback: write to temp file
      try {
        const tmpPath = writeCredsTempFile(creds);
        auth = new google.auth.GoogleAuth({ keyFile: tmpPath, scopes });
      } catch {
        auth = new google.auth.GoogleAuth({ scopes });
      }
    }
  } else {
    auth = new google.auth.GoogleAuth({ scopes });
  }
  return google.drive({ version: "v3", auth });
}

/* List all files currently in the Drive folder → Map<name, fileId> */
async function listFolderFiles(
  drive: ReturnType<typeof getDriveClient>
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  let pageToken: string | undefined;
  /* supportsAllDrives + includeItemsFromAllDrives are required for
     Shared Drives (IDs starting with 0AH). They are no-ops for regular
     My Drive folders, so safe to always include. */
  do {
    const { data } = await drive.files.list({
      q: `'${FOLDER_ID}' in parents and trashed = false`,
      fields: "nextPageToken,files(id,name)",
      pageSize: 1000,
      pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    for (const f of data.files ?? []) {
      if (f.id && f.name) map.set(f.name, f.id);
    }
    pageToken = data.nextPageToken ?? undefined;
  } while (pageToken);
  return map;
}

async function createOrUpdateFile(
  drive: ReturnType<typeof getDriveClient>,
  existing: Map<string, string>,
  name: string,
  buf: Buffer,
  mime: string
): Promise<{ id: string; action: "created" | "updated" }> {
  const body = Readable.from(buf);
  if (existing.has(name)) {
    const id = existing.get(name)!;
    await drive.files.update({
      fileId: id,
      media: { mimeType: mime, body },
      supportsAllDrives: true,
    });
    return { id, action: "updated" };
  }
  const { data } = await drive.files.create({
    requestBody: { name, parents: [FOLDER_ID], mimeType: mime },
    media: { mimeType: mime, body },
    fields: "id,webViewLink",
    supportsAllDrives: true,
  });
  return { id: data.id!, action: "created" };
}

/* ── GET /api/drive/status ─────────────────────── */
router.get("/status", (_req, res) => {
  res.json({
    configured:
      !!FOLDER_ID &&
      (!!process.env.GOOGLE_SERVICE_ACCOUNT_B64 ||
        !!process.env.GOOGLE_SERVICE_ACCOUNT_JSON ||
        !!process.env.GOOGLE_APPLICATION_CREDENTIALS),
    folder_id: FOLDER_ID || null,
    folder_link: FOLDER_ID ? `https://drive.google.com/drive/folders/${FOLDER_ID}` : null,
  });
});

/* ── POST /api/drive/upload ────────────────────────
   Body: { content, filename, mimeType, binaryBase64? }
   If binaryBase64=true, content is decoded from base64 before upload.  */
router.post("/upload", async (req, res) => {
  const {
    content,
    filename,
    mimeType,
    binaryBase64 = false,
  } = req.body as {
    content?: string;
    filename?: string;
    mimeType?: string;
    binaryBase64?: boolean;
  };
  if (!content || !filename || !mimeType)
    return res.status(400).json({ error: "content, filename and mimeType are required" });
  if (!FOLDER_ID) return res.status(500).json({ error: "GOOGLE_DRIVE_FOLDER_ID not configured" });

  try {
    const drive = getDriveClient();
    const existing = await listFolderFiles(drive);
    const buf = binaryBase64 ? Buffer.from(content, "base64") : Buffer.from(content, "utf-8");
    const { id, action } = await createOrUpdateFile(drive, existing, filename, buf, mimeType);
    const { data } = await drive.files.get({ fileId: id, fields: "webViewLink", supportsAllDrives: true });
    res.json({
      ok: true,
      id,
      action,
      link: data.webViewLink ?? `https://drive.google.com/file/d/${id}/view`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    req.log.error({ err: msg }, "Drive upload failed");
    res.status(500).json({ error: msg });
  }
});

/* ── POST /api/drive/delete ────────────────────────
   Permanently deletes a single file by ID. */
router.post("/delete", async (req, res) => {
  const { fileId } = req.body as { fileId?: string };
  if (!fileId) return res.status(400).json({ error: "fileId required" });
  try {
    const drive = getDriveClient();
    await drive.files.delete({ fileId, supportsAllDrives: true });
    res.json({ ok: true, deleted: fileId });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

/* ── POST /api/drive/list ──────────────────────────
   Lists the target folder's contents (for the agent to see what exists). */
router.post("/list", async (_req, res) => {
  if (!FOLDER_ID) return res.status(500).json({ error: "GOOGLE_DRIVE_FOLDER_ID not configured" });
  try {
    const drive = getDriveClient();
    const map = await listFolderFiles(drive);
    res.json({
      ok: true,
      count: map.size,
      files: [...map.entries()].map(([name, id]) => ({
        name,
        id,
        link: `https://drive.google.com/file/d/${id}/view`,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

/* ── POST /api/drive/competitor-cleanup ──────────────────────────
   Lists (or deletes with ?confirm=true) all files inside the
   "Competitor Intel" and "Competitor Slides" subfolders. */
router.post("/competitor-cleanup", async (req, res) => {
  if (!FOLDER_ID) return res.status(500).json({ error: "GOOGLE_DRIVE_FOLDER_ID not configured" });
  const confirm = req.query.confirm === "true";
  const TARGET_FOLDERS = ["Competitor Intel", "Competitor Slides", "Competitor Monitor"];
  try {
    const drive = getDriveClient();
    // Find the target subfolder IDs
    const { data: rootData } = await drive.files.list({
      q: `'${FOLDER_ID}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: "files(id,name)",
      supportsAllDrives: true, includeItemsFromAllDrives: true,
    });
    const folders = (rootData.files ?? []).filter(f => TARGET_FOLDERS.includes(f.name ?? ""));

    // List all files inside those folders
    const allFiles: Array<{ id: string; name: string; folder: string; modifiedTime: string }> = [];
    for (const folder of folders) {
      let pageToken: string | undefined;
      do {
        const { data } = await drive.files.list({
          q: `'${folder.id}' in parents and trashed=false`,
          fields: "nextPageToken,files(id,name,modifiedTime)",
          pageSize: 1000, pageToken,
          supportsAllDrives: true, includeItemsFromAllDrives: true,
        });
        for (const f of data.files ?? []) {
          allFiles.push({ id: f.id!, name: f.name ?? "", folder: folder.name ?? "", modifiedTime: f.modifiedTime ?? "" });
        }
        pageToken = data.nextPageToken ?? undefined;
      } while (pageToken);
    }

    if (!confirm) {
      return res.json({ ok: true, found: allFiles.length, files: allFiles, message: "Add ?confirm=true to delete" });
    }

    // Delete all
    let deleted = 0;
    for (const f of allFiles) {
      await drive.files.delete({ fileId: f.id, supportsAllDrives: true }).catch(() => {});
      deleted++;
    }
    res.json({ ok: true, deleted, message: `Deleted ${deleted} competitor report files` });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;

/* ── Subfolder cache — looks up or creates a named subfolder under FOLDER_ID ─ */
const _subfolderCache = new Map<string, string>(); // name → id

export async function getOrCreateSubfolder(name: string): Promise<string> {
  if (!FOLDER_ID) throw new Error("GOOGLE_DRIVE_FOLDER_ID not configured");
  if (_subfolderCache.has(name)) return _subfolderCache.get(name)!;
  const drive = getDriveClient();
  const { data } = await drive.files.list({
    q: `'${FOLDER_ID}' in parents and mimeType='application/vnd.google-apps.folder' and name='${name}' and trashed=false`,
    fields: "files(id)",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  if (data.files?.length) {
    _subfolderCache.set(name, data.files[0].id!);
    return data.files[0].id!;
  }
  const { data: created } = await drive.files.create({
    requestBody: { name, parents: [FOLDER_ID], mimeType: "application/vnd.google-apps.folder" },
    fields: "id",
    supportsAllDrives: true,
  });
  _subfolderCache.set(name, created.id!);
  return created.id!;
}

/* Helper reused by the autonomous agent */
export async function driveUploadText(
  filename: string,
  content: string,
  mimeType = "text/plain",
  subfolder?: string
): Promise<{ ok: boolean; link?: string; error?: string }> {
  try {
    if (!FOLDER_ID) return { ok: false, error: "GOOGLE_DRIVE_FOLDER_ID not configured" };
    const parentId = subfolder ? await getOrCreateSubfolder(subfolder) : FOLDER_ID;
    const drive = getDriveClient();
    const existing = subfolder
      ? new Map<string, string>()  // subfolders always create fresh
      : await listFolderFiles(drive);
    const buf = Buffer.from(content, "utf-8");
    const body = Readable.from(buf);
    const existingId = existing.get(filename);
    let id: string;
    if (existingId) {
      await drive.files.update({ fileId: existingId, media: { mimeType, body }, supportsAllDrives: true });
      id = existingId;
    } else {
      const { data } = await drive.files.create({
        requestBody: { name: filename, parents: [parentId], mimeType },
        media: { mimeType, body },
        fields: "id",
        supportsAllDrives: true,
      });
      id = data.id!;
    }
    const { data } = await drive.files.get({ fileId: id, fields: "webViewLink", supportsAllDrives: true });
    return { ok: true, link: data.webViewLink ?? `https://drive.google.com/file/d/${id}/view` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/* Upload HTML and have Drive auto-convert it to a native Google Doc. */
export async function driveUploadAsGoogleDoc(
  filename: string,
  htmlContent: string,
  subfolder?: string
): Promise<{ ok: boolean; link?: string; error?: string }> {
  try {
    if (!FOLDER_ID) return { ok: false, error: "GOOGLE_DRIVE_FOLDER_ID not configured" };
    const parentId = subfolder ? await getOrCreateSubfolder(subfolder) : FOLDER_ID;
    const drive = getDriveClient();
    const buf = Buffer.from(htmlContent, "utf-8");
    const body = Readable.from(buf);
    const { data } = await drive.files.create({
      requestBody: {
        name: filename,
        parents: [parentId],
        mimeType: "application/vnd.google-apps.document",
      },
      media: { mimeType: "text/html", body },
      fields: "id,webViewLink",
      supportsAllDrives: true,
    });
    return {
      ok: true,
      link: data.webViewLink ?? `https://docs.google.com/document/d/${data.id}/edit`,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
