import { getImageCache, getTmdbClient } from '../../modules/media/tmdb/index.js';
import { tryServeFile } from './images-helpers.js';

import type { Response } from 'express';

/**
 * Fetch the poster_path for a movie from the TMDB API when the DB has no stored path.
 */
export async function fetchPosterPathFromTmdb(tmdbId: number): Promise<string | null> {
  try {
    const client = getTmdbClient();
    const detail = await client.getMovie(tmdbId);
    return detail.posterPath ?? null;
  } catch (err) {
    console.warn(`[Images] TMDB lookup for ${tmdbId} failed:`, err);
    return null;
  }
}

export interface DownloadAndServeOptions {
  mediaType: string;
  id: number;
  originalPath: string;
  imageType: 'poster' | 'backdrop' | 'logo';
  filePath: string;
  res: Response;
}

async function downloadMovieImage(
  imageCache: ReturnType<typeof getImageCache>,
  id: number,
  imageType: 'poster' | 'backdrop' | 'logo',
  originalPath: string
): Promise<void> {
  await imageCache.downloadMovieImages(
    id,
    imageType === 'poster' ? originalPath : null,
    imageType === 'backdrop' ? originalPath : null,
    imageType === 'logo' ? originalPath : null
  );
}

async function downloadTvImage(
  imageCache: ReturnType<typeof getImageCache>,
  id: number,
  imageType: 'poster' | 'backdrop' | 'logo',
  originalPath: string
): Promise<void> {
  await imageCache.downloadTvShowImages({
    tvdbId: id,
    posterUrl: imageType === 'poster' ? originalPath : null,
    backdropUrl: imageType === 'backdrop' ? originalPath : null,
    logoUrl: imageType === 'logo' ? originalPath : null,
  });
}

/**
 * Download an image from its original source to local cache and serve.
 */
export async function downloadAndServe(opts: DownloadAndServeOptions): Promise<boolean> {
  const imageCache = getImageCache();

  try {
    if (opts.mediaType === 'movie') {
      await downloadMovieImage(imageCache, opts.id, opts.imageType, opts.originalPath);
    } else if (opts.mediaType === 'tv') {
      await downloadTvImage(imageCache, opts.id, opts.imageType, opts.originalPath);
    }
    return await tryServeFile(opts.filePath, opts.res);
  } catch (err) {
    console.warn(`[Images] On-demand download failed for ${opts.mediaType}/${opts.id}:`, err);
    return false;
  }
}
