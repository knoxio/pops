/**
 * Discovery Plex service — trending movies from the Plex Discover API,
 * enriched with library membership status and dismissed filtering.
 */
import { movies } from '@pops/db-types';

import { getDrizzle } from '../../../db.js';
import { getPlexClient } from '../plex/service.js';
import type { PlexMediaItem } from '../plex/types.js';
import { getWatchedTmdbIds, getWatchlistTmdbIds } from './flags.js';
import type { DiscoverResult } from './types.js';

/** Get all TMDB IDs currently in the library for quick lookup. */
function getLibraryTmdbIds(): Set<number> {
  const db = getDrizzle();
  const rows = db.select({ tmdbId: movies.tmdbId }).from(movies).all();
  return new Set(rows.map((r) => r.tmdbId));
}

/** Build a poster URL: proxy for library items, TMDB CDN for Plex thumb otherwise. */
function buildPosterUrl(
  item: PlexMediaItem,
  tmdbId: number | null,
  inLibrary: boolean
): string | null {
  if (inLibrary && tmdbId) return `/media/images/movie/${tmdbId}/poster.jpg`;
  return item.thumbUrl;
}

/** Extract TMDB ID from a Plex item's external IDs. */
function extractTmdbId(item: PlexMediaItem): number | null {
  const tmdbGuid = item.externalIds.find((id) => id.source === 'tmdb');
  if (!tmdbGuid) return null;
  const parsed = parseInt(tmdbGuid.id, 10);
  return isNaN(parsed) ? null : parsed;
}

/** Map a Plex media item to a DiscoverResult. */
function toDiscoverResult(
  item: PlexMediaItem,
  libraryIds: Set<number>,
  watchedIds: Set<number>,
  watchlistIds: Set<number>
): DiscoverResult | null {
  const tmdbId = extractTmdbId(item);
  if (!tmdbId) return null;

  const inLibrary = libraryIds.has(tmdbId);
  return {
    tmdbId,
    title: item.title,
    overview: item.summary ?? '',
    releaseDate: item.year ? `${item.year}-01-01` : '',
    posterPath: null,
    posterUrl: buildPosterUrl(item, tmdbId, inLibrary),
    backdropPath: null,
    voteAverage: item.audienceRating ?? 0,
    voteCount: 0,
    genreIds: [],
    popularity: 0,
    inLibrary,
    isWatched: watchedIds.has(tmdbId),
    onWatchlist: watchlistIds.has(tmdbId),
  };
}

/** Get dismissed TMDB IDs for filtering. Returns empty set if table doesn't exist yet. */
function getDismissedTmdbIds(): Set<number> {
  try {
    const db = getDrizzle();
    const rows = db.all<{ tmdb_id: number }>(/* sql */ `SELECT tmdb_id FROM dismissed_discover`);
    return new Set(rows.map((r) => r.tmdb_id));
  } catch {
    // Table may not exist yet (tb-115 creates it)
    return new Set();
  }
}

/**
 * Fetch trending movies from Plex Discover API.
 * Returns null if Plex is not connected (no client available).
 */
export async function getTrendingFromPlex(limit: number = 20): Promise<DiscoverResult[] | null> {
  const client = getPlexClient();
  if (!client) return null;

  const [plexItems, libraryIds, watchedIds, watchlistIds, dismissedIds] = await Promise.all([
    client.getTrending(limit + 10), // fetch extra to account for filtering
    Promise.resolve(getLibraryTmdbIds()),
    Promise.resolve(getWatchedTmdbIds()),
    Promise.resolve(getWatchlistTmdbIds()),
    Promise.resolve(getDismissedTmdbIds()),
  ]);

  const results: DiscoverResult[] = [];
  const seenTmdbIds = new Set<number>();

  for (const item of plexItems) {
    const result = toDiscoverResult(item, libraryIds, watchedIds, watchlistIds);
    if (!result) continue;
    if (dismissedIds.has(result.tmdbId)) continue;
    if (seenTmdbIds.has(result.tmdbId)) continue;
    seenTmdbIds.add(result.tmdbId);
    results.push(result);
    if (results.length >= limit) break;
  }

  return results;
}
