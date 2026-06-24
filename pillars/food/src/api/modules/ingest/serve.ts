/**
 * Plain Express handlers that stream per-source ingest media (screenshot,
 * video) back to the inbox UI.
 *
 *   GET /ingest/source/:sourceId/screenshot
 *   GET /ingest/source/:sourceId/video
 *
 * Mounted BEFORE the ts-rest endpoints so they resolve to a file; the
 * ts-rest `ingest.*` surface is all POST, so there's no method/path
 * collision.
 *
 * Returns 404 when the source row is missing OR the eviction job already
 * archived it (`archived_at IS NOT NULL`) OR the on-disk file is gone — the
 * inbox UI treats 404 as "no media, skip rendering". `res.sendFile` handles
 * Range requests, so `<video>` seeking works without a manual stream.
 */
import { readdirSync } from 'node:fs';
import { extname, join } from 'node:path';

import { eq } from 'drizzle-orm';

import { type FoodDb, ingestSources } from '../../../db/index.js';
import { ingestDirFor } from './ingest-storage.js';

import type { Request, Response } from 'express';

const CACHE_CONTROL = 'private, max-age=3600';
const SOURCE_ID_RE = /^[1-9]\d*$/;
const SCREENSHOT_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'] as const;
const VIDEO_EXTENSIONS = ['mp4', 'webm', 'mov', 'm4v'] as const;

const CONTENT_TYPE: Readonly<Record<string, string>> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.m4v': 'video/x-m4v',
};

function parseSourceId(req: Request, res: Response): number | null {
  const raw = String(req.params['sourceId'] ?? '');
  if (!SOURCE_ID_RE.test(raw)) {
    res.status(400).json({ message: `Invalid source id: ${raw}` });
    return null;
  }
  return Number(raw);
}

/**
 * Fail closed: only serve media for a source row that exists and hasn't been
 * archived by the FIFO eviction job. Without this guard, a guessed `sourceId`
 * could fish for files on disk. Catches so a missing table (tests without the
 * ingest migration) serves nothing rather than throwing.
 */
function isServableSource(db: FoodDb, sourceId: number): boolean {
  try {
    const row = db
      .select({ archivedAt: ingestSources.archivedAt })
      .from(ingestSources)
      .where(eq(ingestSources.id, sourceId))
      .get();
    return row !== undefined && row.archivedAt === null;
  } catch {
    return false;
  }
}

function findFileWithExtension(
  dir: string,
  baseName: string,
  exts: readonly string[]
): string | null {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return null;
  }
  // Case-insensitive match, on-disk casing preserved: prod's case-sensitive
  // FS would 404 if the worker wrote `Screenshot.PNG`.
  const wanted = new Set(exts.map((ext) => `${baseName}.${ext}`.toLowerCase()));
  for (const entry of entries) {
    if (wanted.has(entry.toLowerCase())) return join(dir, entry);
  }
  return null;
}

interface MediaSpec {
  readonly baseName: string;
  readonly exts: readonly string[];
}

const SCREENSHOT_SPEC: MediaSpec = { baseName: 'screenshot', exts: SCREENSHOT_EXTENSIONS };
const VIDEO_SPEC: MediaSpec = { baseName: 'video', exts: VIDEO_EXTENSIONS };

function serveMedia(db: FoodDb, spec: MediaSpec, req: Request, res: Response): void {
  const sourceId = parseSourceId(req, res);
  if (sourceId === null) return;
  if (!isServableSource(db, sourceId)) {
    res.status(404).json({ message: 'File not found' });
    return;
  }
  const filePath = findFileWithExtension(ingestDirFor(sourceId), spec.baseName, spec.exts);
  if (filePath === null) {
    res.status(404).json({ message: 'File not found' });
    return;
  }
  const contentType = CONTENT_TYPE[extname(filePath).toLowerCase()];
  if (contentType !== undefined) res.type(contentType);
  res.setHeader('Cache-Control', CACHE_CONTROL);
  res.sendFile(filePath);
}

export function makeServeIngestScreenshot(db: FoodDb) {
  return (req: Request, res: Response): void => serveMedia(db, SCREENSHOT_SPEC, req, res);
}

export function makeServeIngestVideo(db: FoodDb) {
  return (req: Request, res: Response): void => serveMedia(db, VIDEO_SPEC, req, res);
}
