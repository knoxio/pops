/**
 * PRD-125 amendment to PRD-110 — HTTP routes for streaming the per-source
 * ingest media (screenshot, video) back to the inbox UI (Epic 03 / PRD-135).
 *
 *   GET /api/food/ingest/source/:sourceId/screenshot
 *   GET /api/food/ingest/source/:sourceId/video
 *
 * Both routes glob the on-disk file under `ingestDirFor(sourceId)`:
 *
 *   - screenshot.{jpg,jpeg,png,webp} per PRD-110 amendment
 *   - video.{mp4,webm,mov,m4v} (whatever yt-dlp wrote; matched by extension)
 *
 * Mounted before auth so the frontend pulls them via plain `<img>` / `<video>`
 * tags. SourceId validation is strict (positive integer, no traversal).
 *
 * The routes return 404 when the source row doesn't exist OR the on-disk
 * directory is missing OR the eviction job already swept the files
 * (`archived_at IS NOT NULL`). The inbox UI uses 404 as the "missing media,
 * skip rendering" signal.
 */
import { readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { type Router as ExpressRouter, type Request, type Response, Router } from 'express';

import { getDb } from '../../db.js';
import { tryServeFile } from '../media/images-helpers.js';

/** Inbox-served media is user-content; short cache so re-uploads land. */
const CACHE_CONTROL = 'private, max-age=3600';

/** Mirror of `packages/app-food/src/storage/ingest-paths.ts`. Duplicated to keep pops-api off the app-food package graph (cycle via @pops/api-client). */
const DEFAULT_FOOD_INGEST_DIR = './data/food/ingest';

function ingestDirFor(sourceId: number): string {
  const configured = process.env['FOOD_INGEST_DIR'];
  const raw = configured && configured.length > 0 ? configured : DEFAULT_FOOD_INGEST_DIR;
  return resolve(raw, String(sourceId));
}

const SOURCE_ID_RE = /^[1-9]\d*$/;
const SCREENSHOT_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'] as const;
const VIDEO_EXTENSIONS = ['mp4', 'webm', 'mov', 'm4v'] as const;

function validateSourceId(req: Request, res: Response): number | null {
  const raw = String(req.params['sourceId'] ?? '');
  if (!SOURCE_ID_RE.test(raw)) {
    res.status(400).json({ error: `Invalid source id: ${raw}` });
    return null;
  }
  return Number(raw);
}

/**
 * Reject requests for sources the user shouldn't see — the row doesn't
 * exist OR the eviction job already archived it (`archived_at IS NOT NULL`).
 * Without this guard, anyone who guesses a `sourceId` can fish for media
 * files on disk regardless of whether the source row was ever real.
 *
 * The check is a single prepared SELECT keyed by primary key — cheap; we
 * skip the Drizzle wrapper to keep the route lean (and dep-free of the
 * food-domain schema imports).
 */
function isServableSource(sourceId: number): boolean {
  try {
    const row = getDb()
      .prepare<[number], { archived_at: string | null }>(
        `SELECT archived_at FROM ingest_sources WHERE id = ?`
      )
      .get(sourceId);
    return row !== undefined && row.archived_at === null;
  } catch {
    // If the table doesn't exist (e.g. tests without food migrations
    // applied), fail closed — the route serves nothing.
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
  // Case-insensitive match but preserve on-disk casing — case-sensitive
  // filesystems (Linux prod runtime) would otherwise 404 when the worker
  // wrote `Screenshot.PNG` and the route looked for `screenshot.png`.
  const wanted = new Set(exts.map((ext) => `${baseName}.${ext}`.toLowerCase()));
  for (const entry of entries) {
    if (wanted.has(entry.toLowerCase())) return join(dir, entry);
  }
  return null;
}

async function serveOr404(filePath: string | null, res: Response): Promise<void> {
  if (filePath === null) {
    res.status(404).json({ error: 'File not found' });
    return;
  }
  const served = await tryServeFile(filePath, res, CACHE_CONTROL);
  if (!served) res.status(404).json({ error: 'File not found' });
}

const router: ExpressRouter = Router();

router.get(
  '/api/food/ingest/source/:sourceId/screenshot',
  async (req: Request, res: Response): Promise<void> => {
    const sourceId = validateSourceId(req, res);
    if (sourceId === null) return;
    if (!isServableSource(sourceId)) {
      res.status(404).json({ error: 'File not found' });
      return;
    }
    const filePath = findFileWithExtension(
      ingestDirFor(sourceId),
      'screenshot',
      SCREENSHOT_EXTENSIONS
    );
    await serveOr404(filePath, res);
  }
);

router.get(
  '/api/food/ingest/source/:sourceId/video',
  async (req: Request, res: Response): Promise<void> => {
    const sourceId = validateSourceId(req, res);
    if (sourceId === null) return;
    if (!isServableSource(sourceId)) {
      res.status(404).json({ error: 'File not found' });
      return;
    }
    const filePath = findFileWithExtension(ingestDirFor(sourceId), 'video', VIDEO_EXTENSIONS);
    await serveOr404(filePath, res);
  }
);

export default router;
