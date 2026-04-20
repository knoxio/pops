import { getAbsolute, putAbsolute } from './client-http.js';
import { mapMediaItem } from './client-mappers.js';
import { type PlexMediaItem, type RawPlexMediaItem } from './types.js';

/** Add an item to the Plex cloud watchlist by discover ratingKey. */
export async function addToWatchlist(token: string, ratingKey: string): Promise<void> {
  await putAbsolute(
    `https://discover.provider.plex.tv/actions/addToWatchlist?ratingKey=${ratingKey}`,
    token
  );
}

/** Remove an item from the Plex cloud watchlist by discover ratingKey. */
export async function removeFromWatchlist(token: string, ratingKey: string): Promise<void> {
  await putAbsolute(
    `https://discover.provider.plex.tv/actions/removeFromWatchlist?ratingKey=${ratingKey}`,
    token
  );
}

/**
 * Get the user's watch state for a Discover item.
 * Returns viewCount (0 = not watched) and lastViewedAt if available.
 * Returns null if the item has no user state (never interacted with).
 */
export async function getUserState(
  token: string,
  discoverRatingKey: string
): Promise<{ viewCount: number; lastViewedAt: number | null } | null> {
  const url =
    `https://metadata.provider.plex.tv/library/metadata/${discoverRatingKey}/userState` +
    `?X-Plex-Token=${token}`;
  try {
    const data = await getAbsolute<{
      MediaContainer: {
        UserState?:
          | { viewCount?: number; lastViewedAt?: number }
          | Array<{ viewCount?: number; lastViewedAt?: number }>;
      };
    }>(url);
    const raw = data.MediaContainer.UserState;
    if (!raw) return null;
    const state = Array.isArray(raw) ? raw[0] : raw;
    if (!state) return null;
    return {
      viewCount: state.viewCount ?? 0,
      lastViewedAt: state.lastViewedAt ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Search the Plex Discover API by title and media type.
 * Returns items with ratingKeys but without external IDs (Guid arrays).
 */
export async function searchDiscover(
  token: string,
  query: string,
  searchType: 'movie' | 'show'
): Promise<PlexMediaItem[]> {
  const typeParam = searchType === 'movie' ? 'movies' : 'tv';
  const url =
    `https://discover.provider.plex.tv/library/search` +
    `?query=${encodeURIComponent(query)}` +
    `&searchTypes=${typeParam}` +
    `&searchProviders=discover` +
    `&limit=5` +
    `&X-Plex-Token=${token}`;

  const data = await getAbsolute<{
    MediaContainer: {
      SearchResults?: Array<{
        SearchResult?: Array<{ Metadata?: RawPlexMediaItem }>;
      }>;
    };
  }>(url);

  const searchResults = data.MediaContainer.SearchResults ?? [];
  const items: PlexMediaItem[] = [];
  for (const group of searchResults) {
    for (const result of group.SearchResult ?? []) {
      if (result.Metadata) items.push(mapMediaItem(result.Metadata));
    }
  }
  return items;
}

/**
 * Fetch full metadata for a Discover item by its ratingKey.
 * Includes Guid array (tmdb://, tvdb://, imdb://) for ID matching.
 */
export async function getDiscoverMetadata(
  token: string,
  ratingKey: string
): Promise<PlexMediaItem | null> {
  const url =
    `https://metadata.provider.plex.tv/library/metadata/${ratingKey}` +
    `?includeGuids=1` +
    `&X-Plex-Token=${token}`;
  try {
    const data = await getAbsolute<{ MediaContainer: { Metadata?: RawPlexMediaItem[] } }>(url);
    const item = data.MediaContainer.Metadata?.[0];
    return item ? mapMediaItem(item) : null;
  } catch {
    return null;
  }
}

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
 * Fetch trending/popular movies from the Plex Discover API.
 */
export async function getTrending(token: string, limit: number = 20): Promise<PlexMediaItem[]> {
  try {
    return await fetchTrendingViaWatchlist(token, limit);
  } catch {
    return fetchTrendingViaHubs(token, limit);
  }
}
