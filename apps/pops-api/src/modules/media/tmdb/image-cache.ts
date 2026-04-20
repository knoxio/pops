/**
 * Media image cache service — downloads and caches images locally.
 *
 * Movie images: {MEDIA_IMAGES_DIR}/movies/{tmdb_id}/ (via TMDB with size prefixes)
 * TV images:    {MEDIA_IMAGES_DIR}/tv/{tvdb_id}/     (via TheTVDB full URLs)
 *
 * Helper modules:
 *  - image-download.ts     — URL allow-list + retry + write to disk
 *  - image-placeholders.ts — SVG placeholder generation
 */
import { mkdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';

import { downloadImage, type RateLimiter } from './image-download.js';
import {
  generateMoviePlaceholder,
  generateTvPlaceholder as generateTvShowPlaceholder,
} from './image-placeholders.js';

export type { RateLimiter } from './image-download.js';

const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';

export const MEDIA_DIR_NAMES: Record<string, string> = {
  movie: 'movies',
  tv: 'tv',
};

const IMAGE_SIZES = {
  poster: 'w780',
  backdrop: 'w1280',
  logo: 'original',
} as const;

const IMAGE_FILENAMES = {
  poster: 'poster.jpg',
  backdrop: 'backdrop.jpg',
  logo: 'logo.png',
  override: 'override.jpg',
} as const;

export type ImageType = keyof typeof IMAGE_FILENAMES;

function seasonFilename(seasonNumber: number): string {
  return `season_${seasonNumber}.jpg`;
}

interface TvImagesInput {
  tvdbId: number;
  posterUrl: string | null;
  backdropUrl: string | null;
  seasonPosters?: Array<{ seasonNumber: number; posterUrl: string | null }>;
  logoUrl?: string | null;
}

export class ImageCacheService {
  private readonly rateLimiter?: RateLimiter;

  constructor(imagesDir: string, rateLimiter?: RateLimiter);
  /** @internal Legacy signature without rate limiter. */
  constructor(imagesDir: string);
  constructor(
    private readonly imagesDir: string,
    rateLimiter?: RateLimiter
  ) {
    this.rateLimiter = rateLimiter;
  }

  /**
   * Download movie images from TMDB to local cache.
   */
  async downloadMovieImages(
    tmdbId: number,
    posterPath: string | null,
    backdropPath: string | null,
    logoPath: string | null
  ): Promise<void> {
    const movieDir = this.movieDir(tmdbId);
    await mkdir(movieDir, { recursive: true });

    const downloads: Promise<void>[] = [];
    if (posterPath) {
      downloads.push(
        downloadImage(
          `${TMDB_IMAGE_BASE}/${IMAGE_SIZES.poster}${posterPath}`,
          join(movieDir, IMAGE_FILENAMES.poster),
          this.rateLimiter
        )
      );
    }
    if (backdropPath) {
      downloads.push(
        downloadImage(
          `${TMDB_IMAGE_BASE}/${IMAGE_SIZES.backdrop}${backdropPath}`,
          join(movieDir, IMAGE_FILENAMES.backdrop),
          this.rateLimiter
        )
      );
    }
    if (logoPath) {
      downloads.push(
        downloadImage(
          `${TMDB_IMAGE_BASE}/${IMAGE_SIZES.logo}${logoPath}`,
          join(movieDir, IMAGE_FILENAMES.logo),
          this.rateLimiter
        )
      );
    }
    if (downloads.length > 0) await Promise.allSettled(downloads);
  }

  /**
   * Download TV show images from TheTVDB to local cache.
   * TheTVDB provides full URLs (no size prefix needed).
   *
   * Accepts either a single options object or the legacy positional form
   * (tvdbId, posterUrl, backdropUrl). For the season-poster / logo variants,
   * use the options-object form.
   */
  downloadTvShowImages(input: TvImagesInput): Promise<void>;
  downloadTvShowImages(
    tvdbId: number,
    posterUrl: string | null,
    backdropUrl: string | null
  ): Promise<void>;
  downloadTvShowImages(
    tvdbIdOrInput: number | TvImagesInput,
    posterUrl: string | null = null,
    backdropUrl: string | null = null
  ): Promise<void> {
    if (typeof tvdbIdOrInput === 'object') {
      return this.downloadTvShowImagesImpl(tvdbIdOrInput);
    }
    return this.downloadTvShowImagesImpl({
      tvdbId: tvdbIdOrInput,
      posterUrl,
      backdropUrl,
    });
  }

  private async downloadTvShowImagesImpl(input: TvImagesInput): Promise<void> {
    const { tvdbId, posterUrl, backdropUrl, seasonPosters, logoUrl } = input;
    const tvDir = this.tvShowDir(tvdbId);
    await mkdir(tvDir, { recursive: true });

    const downloads: Promise<void>[] = [];
    if (posterUrl) {
      downloads.push(
        downloadImage(posterUrl, join(tvDir, IMAGE_FILENAMES.poster), this.rateLimiter)
      );
    }
    if (backdropUrl) {
      downloads.push(
        downloadImage(backdropUrl, join(tvDir, IMAGE_FILENAMES.backdrop), this.rateLimiter)
      );
    }
    if (logoUrl) {
      downloads.push(downloadImage(logoUrl, join(tvDir, IMAGE_FILENAMES.logo), this.rateLimiter));
    }
    if (seasonPosters) {
      for (const sp of seasonPosters) {
        if (sp.posterUrl) {
          downloads.push(
            downloadImage(
              sp.posterUrl,
              join(tvDir, seasonFilename(sp.seasonNumber)),
              this.rateLimiter
            )
          );
        }
      }
    }
    if (downloads.length > 0) await Promise.allSettled(downloads);
  }

  /** Download a single season poster to the TV show's cache directory. */
  async downloadSeasonPoster(
    tvdbId: number,
    seasonNumber: number,
    posterUrl: string | null
  ): Promise<void> {
    if (!posterUrl) return;
    const tvDir = this.tvShowDir(tvdbId);
    await mkdir(tvDir, { recursive: true });
    await downloadImage(posterUrl, join(tvDir, seasonFilename(seasonNumber)), this.rateLimiter);
  }

  /** Get the absolute path to a cached image file, or null if missing. */
  async getImagePath(
    mediaType: 'movie' | 'tv',
    id: number,
    imageType: ImageType
  ): Promise<string | null> {
    const dirName = MEDIA_DIR_NAMES[mediaType] ?? `${mediaType}s`;
    const filePath = join(this.imagesDir, dirName, String(id), IMAGE_FILENAMES[imageType]);
    try {
      await stat(filePath);
      return filePath;
    } catch {
      return null;
    }
  }

  /** Get the absolute path to a cached season poster, or null if missing. */
  async getSeasonImagePath(tvdbId: number, seasonNumber: number): Promise<string | null> {
    const filePath = join(this.tvShowDir(tvdbId), seasonFilename(seasonNumber));
    try {
      await stat(filePath);
      return filePath;
    } catch {
      return null;
    }
  }

  /** Delete all cached images for a movie. */
  async deleteMovieImages(tmdbId: number): Promise<void> {
    await rm(this.movieDir(tmdbId), { recursive: true, force: true });
  }

  /** Delete all cached images for a TV show. */
  async deleteTvShowImages(tvdbId: number): Promise<void> {
    await rm(this.tvShowDir(tvdbId), { recursive: true, force: true });
  }

  private movieDir(tmdbId: number): string {
    return join(this.imagesDir, 'movies', String(tmdbId));
  }

  private tvShowDir(tvdbId: number): string {
    return join(this.imagesDir, 'tv', String(tvdbId));
  }

  /** Generate an SVG placeholder for a movie with no poster image. */
  generatePlaceholder(tmdbId: number, title: string): Promise<void> {
    return generateMoviePlaceholder(this.movieDir(tmdbId), tmdbId, title);
  }

  /** Generate an SVG placeholder for a TV show or season. */
  generateTvPlaceholder(tvdbId: number, title: string, seasonNumber?: number): Promise<void> {
    return generateTvShowPlaceholder(this.tvShowDir(tvdbId), tvdbId, title, seasonNumber);
  }
}
