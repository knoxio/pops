import { TmdbClient } from "./client.js";
import { ImageCacheService } from "./image-cache.js";
import { TokenBucketRateLimiter } from "./rate-limiter.js";
import { getEnv } from "../../../env.js";

export { GenreCache, getGenreCache, setGenreCache } from "./genre-cache.js";
export { TmdbClient } from "./client.js";
export { ImageCacheService } from "./image-cache.js";
export { TmdbApiError, type TmdbSearchResult } from "./types.js";
export type { TmdbGenre, TmdbGenreListResponse } from "./types.js";

/** Shared rate limiter: TMDB allows 40 req / 10 s → 4 req/s. */
const tmdbRateLimiter = new TokenBucketRateLimiter(40, 4);

/**
 * Shared TMDB client factory — reuses a single rate limiter across all routers.
 * Throws immediately with a clear error if TMDB_API_TOKEN is not set.
 */
export function getTmdbClient(): TmdbClient {
  const apiToken = getEnv("TMDB_API_TOKEN");
  if (!apiToken) {
    throw new Error(
      "TMDB_API_TOKEN is not configured. Set it in .env (development) or Docker secrets (production)."
    );
  }
  return new TmdbClient(apiToken, tmdbRateLimiter);
}

const DEFAULT_IMAGES_DIR = "./data/media/images";

/** Lazy singleton for the image cache service. */
let imageCache: ImageCacheService | null = null;

export function getImageCache(): ImageCacheService {
  if (!imageCache) {
    const dir = process.env.MEDIA_IMAGES_DIR ?? DEFAULT_IMAGES_DIR;
    imageCache = new ImageCacheService(dir);
  }
  return imageCache;
}
