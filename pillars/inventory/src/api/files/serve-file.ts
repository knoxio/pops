/**
 * Static file serving helper for the inventory pillar's raw byte routes.
 *
 * Streams a file from disk with a content-type derived from its extension, an
 * mtime+size ETag, and `If-None-Match` 304 handling. Relocated from the
 * monolith's `routes/shared/serve-file.ts`; the inventory pillar owns its copy
 * (the media pillar keeps an equivalent for `/media/images`).
 */
import { createHash } from 'node:crypto';
import { stat } from 'node:fs/promises';
import { extname, resolve } from 'node:path';

import type { Response } from 'express';

const CONTENT_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
};

/** Default: cache for 7 days, revalidate via ETag after that. */
const CACHE_CONTROL = 'public, max-age=604800';

async function sendFileWithErrorHandling(res: Response, filePath: string): Promise<boolean> {
  return new Promise<boolean>((resolvePromise) => {
    res.sendFile(resolve(filePath), (err) => {
      if (err && !res.headersSent) {
        res.removeHeader('Cache-Control');
        res.removeHeader('ETag');
        res.status(500).json({ error: 'Failed to send file' });
      }
      resolvePromise(true);
    });
  });
}

/**
 * Try to serve a file with cache headers. Returns true if the file was served
 * (including a 304), false if it does not exist (so the caller can 404).
 *
 * @param filePath absolute path to the file on disk
 * @param res Express response
 * @param cacheControl override the default `Cache-Control` header. Defaults to
 *   `public, max-age=604800`. Pass a stricter value (e.g. `private,
 *   max-age=3600`) for user-uploaded content.
 */
export async function tryServeFile(
  filePath: string,
  res: Response,
  cacheControl: string = CACHE_CONTROL
): Promise<boolean> {
  try {
    const fileStat = await stat(filePath);
    const ext = extname(filePath);
    const contentType = CONTENT_TYPES[ext] ?? 'application/octet-stream';
    const etag = createHash('md5').update(`${fileStat.mtimeMs}-${fileStat.size}`).digest('hex');

    res.set({
      'Content-Type': contentType,
      'Cache-Control': cacheControl,
      ETag: `"${etag}"`,
    });

    const ifNoneMatch = res.req.get('If-None-Match');
    if (ifNoneMatch === `"${etag}"`) {
      res.status(304).end();
      return true;
    }

    return await sendFileWithErrorHandling(res, filePath);
  } catch {
    return false;
  }
}
