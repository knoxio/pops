import { PlexApiError } from './types.js';

import type { PlexMediaItem } from './types.js';

const PLEX_DISCOVER_BASE = 'https://discover.provider.plex.tv';
const WATCHLIST_PAGE_SIZE = 50;

interface PlexWatchlistResponse {
  MediaContainer: {
    totalSize?: number;
    Metadata?: Array<{
      ratingKey: string;
      guid: string;
      type: string;
      title: string;
      year?: number;
      Guid?: Array<{ id: string }>;
    }>;
  };
}

async function fetchPlexWatchlistPage(
  token: string,
  clientId: string,
  start: number,
  size: number
): Promise<PlexWatchlistResponse> {
  const url =
    `${PLEX_DISCOVER_BASE}/library/sections/watchlist/all` +
    `?X-Plex-Token=${token}` +
    `&X-Plex-Client-Identifier=${clientId}` +
    `&X-Plex-Container-Start=${start}` +
    `&X-Plex-Container-Size=${size}`;

  let response: Response;
  try {
    response = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' } });
  } catch (err) {
    throw new PlexApiError(
      0,
      `Network error fetching Plex watchlist: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (!response.ok) {
    throw new PlexApiError(
      response.status,
      `Plex Discover API error: ${response.status} ${response.statusText}`
    );
  }

  return (await response.json()) as PlexWatchlistResponse;
}

function parseGuids(
  guids: Array<{ id: string }> | undefined
): Array<{ source: string; id: string }> {
  if (!guids) return [];
  return guids
    .map((g) => {
      const match = g.id.match(/^(\w+):\/\/(.+)$/);
      if (!match) return null;
      return { source: match[1], id: match[2] };
    })
    .filter((id): id is { source: string; id: string } => id !== null);
}

/**
 * Fetch all items from the Plex Universal Watchlist (cloud API).
 * Paginates using X-Plex-Container-Start / X-Plex-Container-Size to
 * retrieve every item.
 */
export async function fetchPlexWatchlist(
  token: string,
  clientId: string
): Promise<PlexMediaItem[]> {
  const allItems: PlexMediaItem[] = [];
  let start = 0;

  while (true) {
    const data = await fetchPlexWatchlistPage(token, clientId, start, WATCHLIST_PAGE_SIZE);
    const pageItems = data.MediaContainer.Metadata ?? [];

    for (const item of pageItems) {
      allItems.push({
        ratingKey: item.ratingKey,
        type: item.type,
        title: item.title,
        originalTitle: null,
        summary: null,
        tagline: null,
        year: item.year ?? null,
        thumbUrl: null,
        artUrl: null,
        durationMs: null,
        addedAt: 0,
        updatedAt: 0,
        lastViewedAt: null,
        viewCount: 0,
        rating: null,
        audienceRating: null,
        contentRating: null,
        externalIds: parseGuids(item.Guid),
        genres: [],
        directors: [],
        leafCount: null,
        viewedLeafCount: null,
        childCount: null,
      });
    }

    if (pageItems.length < WATCHLIST_PAGE_SIZE) break;
    start += pageItems.length;
    const totalSize = data.MediaContainer.totalSize;
    if (totalSize !== undefined && allItems.length >= totalSize) break;
  }

  return allItems;
}
