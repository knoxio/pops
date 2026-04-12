/**
 * Express route for serving cached media images.
 *
 * GET /media/images/:mediaType/:id/:filename
 *
 * Three-tier fallback strategy (every poster must load):
 * 1. Serve locally cached image
 * 2. Download from CDN → cache → serve
 * 3. Redirect to CDN URL (browser fetches directly)
 *
 * Falls back to 404 only when there is genuinely no image source.
 */
import { type Router as ExpressRouter, Router } from 'express';
import { open, stat, unlink } from 'node:fs/promises';
import { join, resolve, extname, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { MEDIA_DIR_NAMES } from '../../modules/media/tmdb/image-cache.js';
import { getImageCache } from '../../modules/media/tmdb/index.js';
import { getDb } from '../../db.js';

const VALID_MEDIA_TYPES = ['movie', 'tv'] as const;
const VALID_FILENAMES = ['poster.jpg', 'backdrop.jpg', 'logo.png', 'override.jpg'] as const;
type ValidFilename = (typeof VALID_FILENAMES)[number];

/** Season poster filenames follow the pattern season_{N}.jpg. */
const SEASON_POSTER_RE = /^season_\d+\.jpg$/;

const CONTENT_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
};

/** Cache for 7 days, revalidate via ETag after that. Never use `immutable` — if a
 *  corrupt file is ever served, the browser would be stuck for the full max-age. */
const CACHE_CONTROL = 'public, max-age=604800';

/** CDN size presets for TMDB redirect fallback. */
const TMDB_CDN_SIZES: Record<string, string> = {
  poster: 'w780',
  backdrop: 'w1280',
  logo: 'original',
};

function getImagesDir(): string {
  const dir = process.env.MEDIA_IMAGES_DIR ?? './data/media/images';
  return resolve(dir); // Return absolute path
}

/**
 * Join `filename` to `dir` safely. Uses `basename` to strip any directory
 * components from `filename` (path traversal sanitizer), then verifies the
 * result stays within `dir`. Returns the resolved absolute path, or null on
 * failure.
 */
function safeJoin(dir: string, filename: string): string | null {
  const safe = basename(filename); // strip any path separators — CodeQL sanitizer
  if (!safe || safe === '.' || safe === '..') return null;
  const resolved = resolve(dir, safe);
  return resolved.startsWith(dir + '/') || resolved === dir ? resolved : null;
}

/**
 * Resolve the image type from the filename.
 * Returns "poster", "backdrop", "logo", or "override".
 * "override" is a user upload — never downloaded on-demand.
 */
function resolveImageType(filename: string): 'poster' | 'backdrop' | 'logo' | 'override' {
  if (filename === 'override.jpg') return 'override';
  if (filename.startsWith('poster') || filename.startsWith('season_')) return 'poster';
  if (filename.startsWith('logo')) return 'logo';
  return 'backdrop';
}

/**
 * Build a CDN fallback URL from the stored path.
 * Movies store TMDB-relative paths (e.g. /abc123.jpg) → prepend CDN base.
 * TV shows store full TheTVDB URLs (e.g. https://artworks.thetvdb.com/...) → use as-is.
 */
function buildCdnFallbackUrl(
  mediaType: string,
  path: string,
  imageType: 'poster' | 'backdrop' | 'logo'
): string | null {
  if (mediaType === 'movie' && path.startsWith('/')) {
    const size = TMDB_CDN_SIZES[imageType] ?? 'w780';
    return `https://image.tmdb.org/t/p/${size}${path}`;
  }
  if (mediaType === 'tv' && path.startsWith('http')) {
    return path;
  }
  return null;
}

/**
 * Detect and remove corrupted SVG placeholders (SVG content saved as .jpg).
 * Reads only 4 bytes to check. If corrupted, deletes the file so downstream
 * downloads aren't blocked by the skip-if-exists check in ImageCacheService.
 * Returns true if a corrupted file was found and removed.
 */
async function removeCorruptedPlaceholder(filePath: string): Promise<boolean> {
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

const router: ExpressRouter = Router();

router.get('/media/images/:mediaType/:id/:filename', async (req, res): Promise<void> => {
  const { mediaType, id, filename } = req.params;

  // Validate mediaType
  if (!VALID_MEDIA_TYPES.includes(mediaType as (typeof VALID_MEDIA_TYPES)[number])) {
    res.status(400).json({ error: `Invalid media type: ${mediaType}` });
    return;
  }

  // Validate id is numeric
  if (!/^\d+$/.test(id)) {
    res.status(400).json({ error: `Invalid id: ${id}` });
    return;
  }

  // Validate filename
  if (!VALID_FILENAMES.includes(filename as ValidFilename) && !SEASON_POSTER_RE.test(filename)) {
    res.status(400).json({ error: `Invalid filename: ${filename}` });
    return;
  }

  const imagesDir = getImagesDir();
  const mediaDirName = MEDIA_DIR_NAMES[mediaType] ?? `${mediaType}s`;
  const mediaDir = join(imagesDir, mediaDirName, id);

  // Path traversal defense: ensure resolved path stays within imagesDir
  const resolvedDir = resolve(mediaDir);
  if (!resolvedDir.startsWith(resolve(imagesDir))) {
    res.status(400).json({ error: 'Invalid path' });
    return;
  }

  // Override resolution: if requesting poster.jpg, check for override.jpg first
  if (filename === 'poster.jpg') {
    const overridePath = safeJoin(resolvedDir, 'override.jpg');
    if (overridePath) {
      const served = await tryServeFile(overridePath, res);
      if (served) return;
    }
  }

  // Remove corrupted SVG placeholders so they don't block downloads or get served
  const filePath = safeJoin(resolvedDir, filename);
  if (!filePath) {
    res.status(400).json({ error: 'Invalid path' });
    return;
  }
  const wasCorrupted = await removeCorruptedPlaceholder(filePath);
  if (!wasCorrupted) {
    const served = await tryServeFile(filePath, res);
    if (served) return;
  }

  // Cache miss — try to download on-demand from original source
  // Overrides are user uploads — never downloaded on-demand
  const imageType = resolveImageType(filename);
  if (imageType === 'override') {
    res.status(404).json({ error: 'Image not found' });
    return;
  }

  try {
    const db = getDb();
    const table = mediaType === 'movie' ? 'movies' : 'tv_shows';
    const idColumn = mediaType === 'movie' ? 'tmdb_id' : 'tvdb_id';
    const pathColumn =
      imageType === 'poster' ? 'poster_path' : imageType === 'logo' ? 'logo_path' : 'backdrop_path';

    const record = db
      .prepare(`SELECT ${pathColumn} AS path FROM ${table} WHERE ${idColumn} = ?`)
      .get(id) as { path: string | null } | undefined;

    if (record?.path) {
      // Tier 2: Download from CDN → cache → serve
      const downloaded = await downloadAndServe(
        mediaType,
        Number(id),
        record.path,
        imageType,
        filePath,
        res
      );
      if (downloaded) return;

      // Tier 3: Redirect browser to CDN URL directly
      const cdnUrl = buildCdnFallbackUrl(mediaType, record.path, imageType);
      if (cdnUrl) {
        res.set('Cache-Control', 'private, max-age=300');
        res.redirect(302, cdnUrl);
        return;
      }
    }
  } catch (err) {
    console.error('[Images] Fallback failed:', err);
  }

  // No image source at all
  res.status(404).json({ error: 'Image not found' });
});

/**
 * Download an image from its original source (TMDB or TheTVDB) to the local cache,
 * then serve it. Returns true if the image was served, false on failure.
 */
async function downloadAndServe(
  mediaType: string,
  id: number,
  originalPath: string,
  imageType: 'poster' | 'backdrop' | 'logo',
  filePath: string,
  res: import('express').Response
): Promise<boolean> {
  const imageCache = getImageCache();

  try {
    if (mediaType === 'movie') {
      const posterPath = imageType === 'poster' ? originalPath : null;
      const backdropPath = imageType === 'backdrop' ? originalPath : null;
      const logoPath = imageType === 'logo' ? originalPath : null;
      await imageCache.downloadMovieImages(id, posterPath, backdropPath, logoPath);
    } else if (mediaType === 'tv') {
      const posterUrl = imageType === 'poster' ? originalPath : null;
      const backdropUrl = imageType === 'backdrop' ? originalPath : null;
      const logoUrl = imageType === 'logo' ? originalPath : null;
      await imageCache.downloadTvShowImages(id, posterUrl, backdropUrl, undefined, logoUrl);
    }

    // Serve the freshly downloaded file
    return await tryServeFile(filePath, res);
  } catch (err) {
    console.warn(`[Images] On-demand download failed for ${mediaType}/${id}:`, err);
    return false;
  }
}

/**
 * Try to serve a file with cache headers.
 * Returns true if the file was served, false if it doesn't exist.
 */
async function tryServeFile(filePath: string, res: import('express').Response): Promise<boolean> {
  try {
    const fileStat = await stat(filePath);
    const ext = extname(filePath);
    const contentType = CONTENT_TYPES[ext] ?? 'application/octet-stream';

    // Generate ETag from mtime + size
    const etag = createHash('md5').update(`${fileStat.mtimeMs}-${fileStat.size}`).digest('hex');

    res.set({
      'Content-Type': contentType,
      'Cache-Control': CACHE_CONTROL,
      ETag: `"${etag}"`,
    });

    // Check If-None-Match for conditional requests
    const ifNoneMatch = res.req.get('If-None-Match');
    if (ifNoneMatch === `"${etag}"`) {
      res.status(304).end();
      return true;
    }

    return new Promise<boolean>((resolvePromise) => {
      res.sendFile(resolve(filePath), (err) => {
        if (err) {
          if (!res.headersSent) {
            // Clear immutable cache headers so the error isn't cached
            res.removeHeader('Cache-Control');
            res.removeHeader('ETag');
            res.status(500).json({ error: 'Failed to send file' });
          }
          resolvePromise(true); // Response was handled (even if errored)
        } else {
          resolvePromise(true);
        }
      });
    });
  } catch {
    return false;
  }
}

export default router;
