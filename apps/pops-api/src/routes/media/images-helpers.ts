import { createHash } from 'node:crypto';
import { open, stat, unlink } from 'node:fs/promises';
import { basename, extname, resolve } from 'node:path';

import type { Response } from 'express';

const CONTENT_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
};

/** Cache for 7 days, revalidate via ETag after that. */
const CACHE_CONTROL = 'public, max-age=604800';

const TMDB_CDN_SIZES: Record<string, string> = {
  poster: 'w780',
  backdrop: 'w1280',
  logo: 'original',
};

/**
 * Join `filename` to `dir` safely. Strips path traversal and returns null if escape attempted.
 */
export function safeJoin(dir: string, filename: string): string | null {
  const safe = basename(filename);
  if (!safe || safe === '.' || safe === '..') return null;
  const resolved = resolve(dir, safe);
  return resolved.startsWith(dir + '/') || resolved === dir ? resolved : null;
}

export function resolveImageType(filename: string): 'poster' | 'backdrop' | 'logo' | 'override' {
  if (filename === 'override.jpg') return 'override';
  if (filename.startsWith('poster') || filename.startsWith('season_')) return 'poster';
  if (filename.startsWith('logo')) return 'logo';
  return 'backdrop';
}

export function buildCdnFallbackUrl(
  mediaType: string,
  path: string,
  imageType: 'poster' | 'backdrop' | 'logo'
): string | null {
  if (mediaType === 'movie' && path.startsWith('/')) {
    const size = TMDB_CDN_SIZES[imageType] ?? 'w780';
    return `https://image.tmdb.org/t/p/${size}${path}`;
  }
  if (mediaType === 'tv' && path.startsWith('http')) return path;
  return null;
}

/** Detect and remove corrupted SVG placeholders (SVG content saved as .jpg). */
export async function removeCorruptedPlaceholder(filePath: string): Promise<boolean> {
  let fh: Awaited<ReturnType<typeof open>> | undefined;
  try {
    fh = await open(filePath, 'r');
    const buf = Buffer.alloc(4);
    const { bytesRead } = await fh.read(buf, 0, 4, 0);
    if (bytesRead < 4) return false;

    if (buf.toString('ascii', 0, 4) === '<svg') {
      await fh.close();
      fh = undefined;
      await unlink(filePath).catch(() => {});
      return true;
    }
    return false;
  } catch {
    return false;
  } finally {
    await fh?.close();
  }
}

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
 * Try to serve a file with cache headers. Returns true if the file was served.
 *
 * @param filePath absolute path to the file on disk
 * @param res Express response
 * @param cacheControl override the default `Cache-Control` header. Defaults to
 *   `public, max-age=604800` (suitable for immutable media images). Pass a
 *   stricter value (e.g. `private, max-age=3600`) for user-uploaded content.
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
