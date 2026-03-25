import { TmdbClient } from "./client.js";
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
 * Returns null if TMDB_API_KEY is not set (checks Docker secrets then env vars).
 */
export function getTmdbClient(): TmdbClient | null {
  const apiKey = getEnv("TMDB_API_KEY");
  if (!apiKey) return null;
  return new TmdbClient(apiKey, tmdbRateLimiter);
}
