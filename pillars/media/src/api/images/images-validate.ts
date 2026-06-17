/**
 * Request-parameter validation + cache-directory resolution for the
 * `/media/images` byte route. Split out of the router so the handler stays
 * focused on the three-tier fallback flow.
 */
import { join, resolve } from 'node:path';

import { getMediaImagesDir } from '../clients/env.js';
import { MEDIA_DIR_NAMES } from '../clients/tmdb/image-cache.js';

import type { Request } from 'express';

const VALID_MEDIA_TYPES = ['movie', 'tv'] as const;
const VALID_FILENAMES = ['poster.jpg', 'backdrop.jpg', 'logo.png', 'override.jpg'] as const;
type ValidFilename = (typeof VALID_FILENAMES)[number];

/** Season poster filenames follow the pattern season_{N}.jpg. */
const SEASON_POSTER_RE = /^season_\d+\.jpg$/;

export interface ValidationFailure {
  status: number;
  body: { error: string };
}

export interface ValidatedParams {
  mediaType: string;
  id: string;
  filename: string;
}

export function validateParams(req: Request): ValidatedParams | ValidationFailure {
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

export function isValidationFailure(
  value: ValidatedParams | ValidationFailure
): value is ValidationFailure {
  return 'status' in value;
}

/**
 * Resolve the on-disk directory holding a media item's cached images, or
 * `null` if the resolved path escapes `MEDIA_IMAGES_DIR` (defence in depth on
 * top of the per-param validation).
 */
export function getMediaDir(mediaType: string, id: string): string | null {
  const imagesDir = resolve(getMediaImagesDir());
  const mediaDirName = MEDIA_DIR_NAMES[mediaType] ?? `${mediaType}s`;
  const resolvedDir = resolve(join(imagesDir, mediaDirName, id));
  if (!resolvedDir.startsWith(imagesDir)) return null;
  return resolvedDir;
}
