/**
 * Express router for serving cached media images.
 *
 * GET /media/images/:mediaType/:id/:filename
 *
 * Three-tier fallback strategy: serve cached → download+cache → redirect to
 * CDN → 404. This is a plain Express router mounted alongside the ts-rest
 * endpoints; it is intentionally NOT part of the contract, so it adds no
 * OpenAPI paths.
 *
 * Poster-path lookups go through the pillar's drizzle-backed `moviesService`
 * / `tvShowsService` against the injected DB handle.
 */
import { type Router as ExpressRouter, type Request, type Response, Router } from 'express';

import { moviesService, tvShowsService, type MediaDb } from '../../db/index.js';
import { downloadAndServe, fetchPosterPathFromTmdb } from './images-fallback.js';
import {
  buildCdnFallbackUrl,
  removeCorruptedPlaceholder,
  resolveImageType,
  safeJoin,
  tryServeFile,
} from './images-helpers.js';
import { getMediaDir, isValidationFailure, validateParams } from './images-validate.js';

export interface ImagesRouterDeps {
  /** Open drizzle handle to the media pillar's SQLite. */
  mediaDb: MediaDb;
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

type StoredImageType = 'poster' | 'backdrop' | 'logo';

function storedPath(
  record: { posterPath: string | null; backdropPath: string | null; logoPath: string | null },
  imageType: StoredImageType
): string | null {
  if (imageType === 'poster') return record.posterPath;
  if (imageType === 'logo') return record.logoPath;
  return record.backdropPath;
}

async function lookupImagePath(
  db: MediaDb,
  mediaType: string,
  id: string,
  imageType: StoredImageType
): Promise<string | null> {
  const numericId = Number(id);
  const record =
    mediaType === 'movie'
      ? moviesService.getMovieByTmdbId(db, numericId)
      : tvShowsService.getTvShowByTvdbId(db, numericId);
  if (!record) return null;

  const resolvedPath = storedPath(record, imageType);
  if (!resolvedPath && mediaType === 'movie' && imageType === 'poster') {
    return fetchPosterPathFromTmdb(numericId);
  }
  return resolvedPath;
}

interface FallbackArgs {
  db: MediaDb;
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
    const resolvedPath = await lookupImagePath(args.db, args.mediaType, args.id, imageType);
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

/**
 * Build the `/media/images` byte router bound to an open media DB handle.
 * Mounted in `createMediaApiApp` after the ts-rest endpoints.
 */
export function createImagesRouter(deps: ImagesRouterDeps): ExpressRouter {
  const router = Router();

  router.get('/media/images/:mediaType/:id/:filename', async (req: Request, res: Response) => {
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
      db: deps.mediaDb,
      mediaType: params.mediaType,
      id: params.id,
      filename: params.filename,
      filePath: cached.filePath,
      res,
    });
  });

  return router;
}
