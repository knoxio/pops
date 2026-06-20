/**
 * Plex Discover (cloud) trending client.
 *
 * Ported from the monolith `media/plex/client-discover.ts` (trending path
 * only). Targets the Plex Discover provider endpoints (absolute cloud URLs
 * with the token in the query string), so it reuses {@link getAbsolute} +
 * {@link mapMediaItem} rather than the Plex Media Server `PlexClient`.
 *
 * Only the trending surface is ported here; the watchlist mutate / user-state /
 * discover-search endpoints stay deferred (separate features).
 */
import { getAbsolute } from './client-http.js';
import { mapMediaItem } from './client-mappers.js';

import type { PlexMediaItem, RawPlexMediaItem } from './types.js';

const DEFAULT_TRENDING_LIMIT = 20;

/** Watchlist popularity feed — popular movies ranked by monthly popularity. */
async function fetchTrendingViaWatchlist(token: string, limit: number): Promise<PlexMediaItem[]> {
  const url =
    `https://discover.provider.plex.tv/library/sections/watchlist/all` +
    `?type=1` +
    `&sort=popularityMonth:desc` +
    `&limit=${limit}` +
    `&includeGuids=1` +
    `&X-Plex-Token=${token}`;
  const data = await getAbsolute<{ MediaContainer: { Metadata?: RawPlexMediaItem[] } }>(url);
  return (data.MediaContainer.Metadata ?? []).map(mapMediaItem);
}

/** Promoted hubs fallback — pull movie items out of the discover hubs. */
async function fetchTrendingViaHubs(token: string, limit: number): Promise<PlexMediaItem[]> {
  const hubUrl =
    `https://discover.provider.plex.tv/hubs/promoted` +
    `?count=${limit}` +
    `&includeGuids=1` +
    `&X-Plex-Token=${token}`;
  const hubData = await getAbsolute<{
    MediaContainer: { Hub?: Array<{ type: string; Metadata?: RawPlexMediaItem[] }> };
  }>(hubUrl);
  const hubs = hubData.MediaContainer.Hub ?? [];
  const movieItems: PlexMediaItem[] = [];
  for (const hub of hubs) {
    for (const item of hub.Metadata ?? []) {
      if (item.type === 'movie') movieItems.push(mapMediaItem(item));
      if (movieItems.length >= limit) break;
    }
    if (movieItems.length >= limit) break;
  }
  return movieItems.slice(0, limit);
}

/**
 * Fetch trending/popular movies from the Plex Discover API. Prefers the
 * watchlist popularity feed and falls back to the promoted hubs on error.
 */
export async function getTrending(
  token: string,
  limit: number = DEFAULT_TRENDING_LIMIT
): Promise<PlexMediaItem[]> {
  try {
    return await fetchTrendingViaWatchlist(token, limit);
  } catch {
    return fetchTrendingViaHubs(token, limit);
  }
}
