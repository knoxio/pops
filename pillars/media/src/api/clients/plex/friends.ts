/**
 * Plex friends API — fetches the friends list and friend watchlists from the
 * Plex.tv cloud + Discover APIs.
 *
 * Ported from the monolith `media/plex/friends.ts`. Standalone (token /
 * clientId args) rather than `PlexClient` methods because these endpoints live
 * on the Plex cloud, not the local Media Server.
 *
 * Limitations:
 * - Friend watchlists are only accessible when the friend's watchlist
 *   visibility is "friends" or "public" on Plex.
 * - The Plex community API requires the user's own token; it cannot
 *   impersonate friends. We access shared/public watchlists only.
 */
import { PlexApiError } from './types.js';

export interface PlexFriend {
  id: number;
  uuid: string;
  title: string;
  username: string;
  thumb: string | null;
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

/** Fetch the user's Plex friends from the Plex.tv API (requires the user's token). */
export async function fetchPlexFriends(token: string): Promise<PlexFriend[]> {
  const url = `https://plex.tv/api/v2/friends?X-Plex-Token=${encodeURIComponent(token)}`;

  let response: Response;
  try {
    response = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' } });
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

const PLEX_DISCOVER_BASE = 'https://discover.provider.plex.tv';
const PAGE_SIZE = 50;

interface PlexWatchlistResponse {
  MediaContainer: {
    totalSize?: number;
    Metadata?: PlexCommunityWatchlistItem[];
  };
}

export interface FriendWatchlistInput {
  token: string;
  clientId: string;
  friendUuid: string;
}

interface PageRequest extends FriendWatchlistInput {
  start: number;
  size: number;
}

/** A movie pulled from a friend's watchlist (only movies with a TMDB GUID). */
export interface FriendWatchlistMovie {
  tmdbId: number;
  title: string;
  year: number | null;
}

function collectMovieItems(pageItems: PlexCommunityWatchlistItem[]): FriendWatchlistMovie[] {
  const out: FriendWatchlistMovie[] = [];
  for (const item of pageItems) {
    if (item.type !== 'movie') continue;
    const tmdbId = extractTmdbIdFromGuids(item.Guid);
    if (!tmdbId) continue;
    out.push({ tmdbId, title: item.title, year: item.year ?? null });
  }
  return out;
}

async function fetchFriendWatchlistPage(req: PageRequest): Promise<PlexWatchlistResponse> {
  const { token, clientId, friendUuid, start, size } = req;
  const url =
    `${PLEX_DISCOVER_BASE}/library/sections/watchlist/all` +
    `?X-Plex-Token=${encodeURIComponent(token)}` +
    `&X-Plex-Client-Identifier=${encodeURIComponent(clientId)}` +
    `&X-Plex-Container-Start=${start}` +
    `&X-Plex-Container-Size=${size}` +
    `&includeGuids=1` +
    `&uri=server%3A%2F%2F${friendUuid}%2Fcom.plexapp.plugins.library`;

  let response: Response;
  try {
    response = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' } });
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

/**
 * Fetch a friend's watchlist via the Plex Discover API (paginated). Returns an
 * empty array when the watchlist is private or inaccessible (401/403/404).
 */
export async function fetchFriendWatchlist(
  input: FriendWatchlistInput
): Promise<FriendWatchlistMovie[]> {
  const items: FriendWatchlistMovie[] = [];
  let start = 0;

  for (;;) {
    let data: PlexWatchlistResponse;
    try {
      data = await fetchFriendWatchlistPage({ ...input, start, size: PAGE_SIZE });
    } catch (err) {
      if (err instanceof PlexApiError && [401, 403, 404].includes(err.status)) return [];
      throw err;
    }

    const pageItems = data.MediaContainer.Metadata ?? [];
    items.push(...collectMovieItems(pageItems));

    if (pageItems.length < PAGE_SIZE) break;
    start += pageItems.length;
    const totalSize = data.MediaContainer.totalSize;
    if (totalSize !== undefined && start >= totalSize) break;
  }

  return items;
}

/** Extract a TMDB ID from a Plex Guid array (entries look like `tmdb://27205`). */
function extractTmdbIdFromGuids(guids: Array<{ id: string }> | undefined): number | null {
  if (!guids) return null;
  for (const g of guids) {
    const match = g.id.match(/^tmdb:\/\/(\d+)$/);
    if (match) return Number(match[1]);
  }
  return null;
}
