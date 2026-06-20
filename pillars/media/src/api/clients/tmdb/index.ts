import { getEnv, getMediaImagesDir } from '../env.js';
import { TmdbClient } from './client.js';
import { ImageCacheService } from './image-cache.js';
import { TokenBucketRateLimiter } from './rate-limiter.js';

export { TmdbClient } from './client.js';
export { GenreCache, getGenreCache, setGenreCache } from './genre-cache.js';
export { ImageCacheService } from './image-cache.js';
export type {
  TmdbGenre,
  TmdbGenreListResponse,
  TmdbMovieCredits,
  TmdbSearchResponse,
} from './types.js';
export { TmdbApiError, type TmdbSearchResult } from './types.js';

/** Shared rate limiter: TMDB allows 40 req / 10 s → 4 req/s. */
const tmdbRateLimiter = new TokenBucketRateLimiter(40, 4);

/**
 * Shared TMDB client factory — reuses a single rate limiter across all callers.
 * Throws immediately with a clear error if TMDB_API_KEY is not set.
 */
export function getTmdbClient(): TmdbClient {
  const apiToken = getEnv('TMDB_API_KEY');
  if (!apiToken) {
    throw new Error(
      'TMDB_API_KEY is not configured. Set it in .env (development) or Docker secrets (production).'
    );
  }
  return new TmdbClient(apiToken, tmdbRateLimiter);
}

/** Lazy singleton for the image cache service. */
let imageCache: ImageCacheService | null = null;

export function getImageCache(): ImageCacheService {
  if (!imageCache) {
    imageCache = new ImageCacheService(getMediaImagesDir(), tmdbRateLimiter);
  }
  return imageCache;
}
