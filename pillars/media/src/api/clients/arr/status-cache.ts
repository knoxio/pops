/**
 * Cached movie/show status lookups against Radarr/Sonarr.
 *
 * Module-level 5-minute cache (parity with the monolith). Returns stale
 * cache on connection failure, or a clear "not configured" / "unavailable"
 * status so the FE can render a stable badge.
 */
import { getRadarrClient, getSonarrClient } from './config.js';

import type { ArrStatusResult } from './types.js';

const CACHE_TTL_MS = 5 * 60 * 1000;

interface CacheEntry {
  result: ArrStatusResult;
  expiresAt: number;
}

const movieStatusCache = new Map<number, CacheEntry>();
const showStatusCache = new Map<number, CacheEntry>();

/** Get movie status from Radarr with caching. Returns stale cache on connection failure. */
export async function getMovieStatus(tmdbId: number): Promise<ArrStatusResult> {
  const cached = movieStatusCache.get(tmdbId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.result;
  }

  const client = getRadarrClient();
  if (!client) {
    return { status: 'not_found', label: 'Radarr not configured' };
  }

  try {
    const result = await client.getMovieStatus(tmdbId);
    movieStatusCache.set(tmdbId, { result, expiresAt: Date.now() + CACHE_TTL_MS });
    return result;
  } catch (err) {
    console.warn(
      `Radarr connection failure for tmdbId=${tmdbId}:`,
      err instanceof Error ? err.message : err
    );
    if (cached) return cached.result;
    return { status: 'unavailable', label: 'Radarr unavailable' };
  }
}

/** Get TV show status from Sonarr with caching. Returns stale cache on connection failure. */
export async function getShowStatus(tvdbId: number): Promise<ArrStatusResult> {
  const cached = showStatusCache.get(tvdbId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.result;
  }

  const client = getSonarrClient();
  if (!client) {
    return { status: 'not_found', label: 'Sonarr not configured' };
  }

  try {
    const result = await client.getShowStatus(tvdbId);
    showStatusCache.set(tvdbId, { result, expiresAt: Date.now() + CACHE_TTL_MS });
    return result;
  } catch (err) {
    console.warn(
      `Sonarr connection failure for tvdbId=${tvdbId}:`,
      err instanceof Error ? err.message : err
    );
    if (cached) return cached.result;
    return { status: 'unavailable', label: 'Sonarr unavailable' };
  }
}

/** Clear cached status for a specific movie by tmdbId. */
export function clearMovieStatusCache(tmdbId: number): void {
  movieStatusCache.delete(tmdbId);
}

/** Clear all cached movie/show statuses. */
export function clearAllStatusCaches(): void {
  movieStatusCache.clear();
  showStatusCache.clear();
}
