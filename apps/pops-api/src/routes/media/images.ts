/**
 * Express route for serving cached media images.
 *
 * GET /media/images/:mediaType/:id/:filename
 *
 * Three-tier fallback strategy: serve cached → download+cache → redirect to CDN.
 */
import { join, resolve } from 'node:path';

import { type Router as ExpressRouter, type Request, type Response, Router } from 'express';

import { getDb } from '../../db.js';
import { MEDIA_DIR_NAMES } from '../../modules/media/tmdb/image-cache.js';
import { downloadAndServe, fetchPosterPathFromTmdb } from './images-fallback.js';
import {
  buildCdnFallbackUrl,
  removeCorruptedPlaceholder,
  resolveImageType,
  safeJoin,
  tryServeFile,
} from './images-helpers.js';

const VALID_MEDIA_TYPES = ['movie', 'tv'] as const;
const VALID_FILENAMES = ['poster.jpg', 'backdrop.jpg', 'logo.png', 'override.jpg'] as const;
type ValidFilename = (typeof VALID_FILENAMES)[number];

/** Season poster filenames follow the pattern season_{N}.jpg. */
const SEASON_POSTER_RE = /^season_\d+\.jpg$/;

function getImagesDir(): string {
  const dir = process.env.MEDIA_IMAGES_DIR ?? './data/media/images';
  return resolve(dir);
}

interface ValidationFailure {
  status: number;
  body: { error: string };
}

interface ValidatedParams {
  mediaType: string;
  id: string;
  filename: string;
}

function validateParams(req: Request): ValidatedParams | ValidationFailure {
  const mediaType = String(req.params['mediaType'] ?? '');
  const id = String(req.params['id'] ?? '');
  const filename = String(req.params['filename'] ?? '');

  if (!VALID_MEDIA_TYPES.includes(mediaType as (typeof VALID_MEDIA_TYPES)[number])) {
    return { status: 400, body: { error: `Invalid media type: ${mediaType}` } };
  }
  if (!/^\d+$/.test(id)) return { status: 400, body: { error: `Invalid id: ${id}` } };
  if (!VALID_FILENAMES.includes(filename as ValidFilename) && !SEASON_POSTER_RE.test(filename)) {
    return { status: 400, body: { error: `Invalid filename: ${filename}` } };
  }
  return { mediaType, id, filename };
}

function isValidationFailure(
  value: ValidatedParams | ValidationFailure
): value is ValidationFailure {
  return 'status' in value;
}

function getMediaDir(mediaType: string, id: string): string | null {
  const imagesDir = getImagesDir();
  const mediaDirName = MEDIA_DIR_NAMES[mediaType] ?? `${mediaType}s`;
  const resolvedDir = resolve(join(imagesDir, mediaDirName, id));
  if (!resolvedDir.startsWith(resolve(imagesDir))) return null;
  return resolvedDir;
}

async function tryOverrideOrCached(
  resolvedDir: string,
  filename: string,
  res: Response
): Promise<{ served: true } | { served: false; filePath: string }> {
  if (filename === 'poster.jpg') {
    const overridePath = safeJoin(resolvedDir, 'override.jpg');
    if (overridePath && (await tryServeFile(overridePath, res))) return { served: true };
  }

  const filePath = safeJoin(resolvedDir, filename);
  if (!filePath) {
    res.status(400).json({ error: 'Invalid path' });
    return { served: true };
  }

  const wasCorrupted = await removeCorruptedPlaceholder(filePath);
  if (!wasCorrupted && (await tryServeFile(filePath, res))) return { served: true };
  return { served: false, filePath };
}

interface DbLookupResult {
  pathColumn: string;
  resolvedPath: string | null;
}

async function lookupImagePath(
  mediaType: string,
  id: string,
  imageType: 'poster' | 'backdrop' | 'logo'
): Promise<DbLookupResult> {
  const db = getDb();
  const table = mediaType === 'movie' ? 'movies' : 'tv_shows';
  const idColumn = mediaType === 'movie' ? 'tmdb_id' : 'tvdb_id';
  let pathColumn: string;
  if (imageType === 'poster') pathColumn = 'poster_path';
  else if (imageType === 'logo') pathColumn = 'logo_path';
  else pathColumn = 'backdrop_path';

  const record = db
    .prepare(`SELECT ${pathColumn} AS path FROM ${table} WHERE ${idColumn} = ?`)
    .get(id) as { path: string | null } | undefined;

  let resolvedPath = record?.path ?? null;
  if (!resolvedPath && mediaType === 'movie' && imageType === 'poster' && record !== undefined) {
    resolvedPath = await fetchPosterPathFromTmdb(Number(id));
  }
  return { pathColumn, resolvedPath };
}

interface FallbackArgs {
  mediaType: string;
  id: string;
  filename: string;
  filePath: string;
  res: Response;
}

async function attemptFallbacks(args: FallbackArgs): Promise<void> {
  const imageType = resolveImageType(args.filename);
  if (imageType === 'override') {
    args.res.status(404).json({ error: 'Image not found' });
    return;
  }

  try {
    const { resolvedPath } = await lookupImagePath(args.mediaType, args.id, imageType);
    if (resolvedPath) {
      const downloaded = await downloadAndServe({
        mediaType: args.mediaType,
        id: Number(args.id),
        originalPath: resolvedPath,
        imageType,
        filePath: args.filePath,
        res: args.res,
      });
      if (downloaded) return;

      const cdnUrl = buildCdnFallbackUrl(args.mediaType, resolvedPath, imageType);
      if (cdnUrl) {
        args.res.set('Cache-Control', 'private, max-age=300');
        args.res.redirect(302, cdnUrl);
        return;
      }
    }
  } catch (err) {
    console.error('[Images] Fallback failed:', err);
  }

  args.res.status(404).json({ error: 'Image not found' });
}

const router: ExpressRouter = Router();

router.get('/media/images/:mediaType/:id/:filename', async (req, res): Promise<void> => {
  const params = validateParams(req);
  if (isValidationFailure(params)) {
    res.status(params.status).json(params.body);
    return;
  }

  const resolvedDir = getMediaDir(params.mediaType, params.id);
  if (!resolvedDir) {
    res.status(400).json({ error: 'Invalid path' });
    return;
  }

  const cached = await tryOverrideOrCached(resolvedDir, params.filename, res);
  if (cached.served) return;

  await attemptFallbacks({
    mediaType: params.mediaType,
    id: params.id,
    filename: params.filename,
    filePath: cached.filePath,
    res,
  });
});

export default router;
