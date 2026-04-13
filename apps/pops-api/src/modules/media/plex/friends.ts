/**
 * Plex friends API — fetches friends list and friend watchlists
 * from the Plex.tv cloud API.
 *
 * Uses https://plex.tv/api/v2/friends for friend listing and
 * https://community.plex.tv/api for friend watchlist access.
 *
 * Limitations:
 * - Friend watchlists are only accessible if the friend has their
 *   watchlist visibility set to "friends" or "public" on Plex.
 * - The Plex community API requires the user's own token; it cannot
 *   impersonate friends. We access shared/public watchlists only.
 * - Rate limits on the community API are undocumented; we paginate
 *   conservatively (50 items per page).
 */
import { PlexApiError } from './types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PlexFriend {
  id: number;
  uuid: string;
  title: string; // Display name
  username: string;
  thumb: string | null; // Avatar URL
  restricted: boolean;
  home: boolean;
}

interface RawPlexFriend {
  id: number;
  uuid: string;
  title: string;
  username: string;
  thumb?: string;
  restricted: boolean;
  home: boolean;
}

interface PlexCommunityWatchlistItem {
  ratingKey: string;
  type: string;
  title: string;
  year?: number;
  Guid?: Array<{ id: string }>;
}

// ---------------------------------------------------------------------------
// Friends list
// ---------------------------------------------------------------------------

/**
 * Fetch the user's Plex friends from the Plex.tv API.
 * Requires the user's own Plex token.
 */
export async function fetchPlexFriends(token: string): Promise<PlexFriend[]> {
  const url = `https://plex.tv/api/v2/friends?X-Plex-Token=${token}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
  } catch (err) {
    throw new PlexApiError(
      0,
      `Network error fetching Plex friends: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (!response.ok) {
    throw new PlexApiError(
      response.status,
      `Plex friends API error: ${response.status} ${response.statusText}`
    );
  }

  const raw = (await response.json()) as RawPlexFriend[];

  return raw.map((f) => ({
    id: f.id,
    uuid: f.uuid,
    title: f.title,
    username: f.username,
    thumb: f.thumb ?? null,
    restricted: f.restricted,
    home: f.home,
  }));
}

// ---------------------------------------------------------------------------
// Friend watchlist
// ---------------------------------------------------------------------------

const PLEX_DISCOVER_BASE = 'https://discover.provider.plex.tv';
const PAGE_SIZE = 50;

interface PlexWatchlistResponse {
  MediaContainer: {
    totalSize?: number;
    Metadata?: PlexCommunityWatchlistItem[];
  };
}

/**
 * Fetch a friend's watchlist via the Plex Discover API.
 *
 * Uses the friend's UUID to request their shared watchlist.
 * Returns an empty array if the watchlist is private or inaccessible.
 *
 * @param token - The current user's Plex token
 * @param clientId - The Plex client identifier
 * @param friendUri - The friend's account URI (e.g., "server://uuid/com.plexapp.plugins.library")
 *   or UUID for the community endpoint
 */
export async function fetchFriendWatchlist(
  token: string,
  clientId: string,
  friendUuid: string
): Promise<Array<{ tmdbId: number; title: string; year: number | null }>> {
  const items: Array<{ tmdbId: number; title: string; year: number | null }> = [];
  let start = 0;

  while (true) {
    let data: PlexWatchlistResponse;
    try {
      data = await fetchFriendWatchlistPage(token, clientId, friendUuid, start, PAGE_SIZE);
    } catch (err) {
      // If the friend's watchlist is private/inaccessible (401/403/404), return empty
      if (err instanceof PlexApiError && [401, 403, 404].includes(err.status)) {
        return [];
      }
      throw err;
    }

    const pageItems = data.MediaContainer.Metadata ?? [];

    for (const item of pageItems) {
      // Only movies
      if (item.type !== 'movie') continue;

      const tmdbId = extractTmdbIdFromGuids(item.Guid);
      if (!tmdbId) continue;

      items.push({
        tmdbId,
        title: item.title,
        year: item.year ?? null,
      });
    }

    if (pageItems.length < PAGE_SIZE) break;

    start += pageItems.length;

    const totalSize = data.MediaContainer.totalSize;
    if (totalSize !== undefined && start >= totalSize) break;
  }

  return items;
}

async function fetchFriendWatchlistPage(
  token: string,
  clientId: string,
  friendUuid: string,
  start: number,
  size: number
): Promise<PlexWatchlistResponse> {
  // Use the Plex Discover API's friend watchlist endpoint.
  // The friendUuid is passed as the X-Plex-Account-ID to view their shared data.
  const url =
    `${PLEX_DISCOVER_BASE}/library/sections/watchlist/all` +
    `?X-Plex-Token=${token}` +
    `&X-Plex-Client-Identifier=${clientId}` +
    `&X-Plex-Container-Start=${start}` +
    `&X-Plex-Container-Size=${size}` +
    `&includeGuids=1` +
    `&uri=server%3A%2F%2F${friendUuid}%2Fcom.plexapp.plugins.library`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
  } catch (err) {
    throw new PlexApiError(
      0,
      `Network error fetching friend watchlist: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (!response.ok) {
    throw new PlexApiError(
      response.status,
      `Plex friend watchlist API error: ${response.status} ${response.statusText}`
    );
  }

  return (await response.json()) as PlexWatchlistResponse;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract a TMDB ID from a Plex Guid array.
 * Guid entries look like: { id: "tmdb://27205" }
 */
function extractTmdbIdFromGuids(guids: Array<{ id: string }> | undefined): number | null {
  if (!guids) return null;
  for (const g of guids) {
    const match = g.id.match(/^tmdb:\/\/(\d+)$/);
    if (match) return Number(match[1]);
  }
  return null;
}
