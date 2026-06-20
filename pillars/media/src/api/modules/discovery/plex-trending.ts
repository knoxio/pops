/**
 * Plex Discover trending orchestration — fetches trending movies from the Plex
 * Discover API and annotates them with library / watched / watchlist flags,
 * dropping dismissed items.
 *
 * Ported from the monolith `discovery/plex-service.getTrendingFromPlex`,
 * converted to the pillar's `(db, …)` arg pattern: the Plex token is resolved
 * (and decrypted) from `plex_settings` via {@link getPlexToken}, exactly like
 * the rotation Plex sources. Returns `null` when no token is configured (parity
 * with the monolith returning `null` when no Plex client is available).
 */
import { type MediaDb } from '../../../db/index.js';
import { getPlexDiscoverTrending, getPlexToken } from '../../clients/plex/index.js';
import { loadFlagSets } from './deps.js';

import type { DiscoverResult } from '../../../db/index.js';
import type { PlexMediaItem } from '../../clients/plex/index.js';
import type { FlagSets } from './discover-result-mapper.js';

const DEFAULT_PLEX_TRENDING_LIMIT = 20;
/** Over-fetch so library / watched / dismissed filtering still fills the page. */
const FILTER_HEADROOM = 10;

/**
 * Poster URL for a Plex Discover item: the local image proxy for in-library
 * movies, the Plex CDN thumb otherwise. Unlike the TMDB poster builder, an
 * in-library item always resolves to the proxy even without a Plex thumb.
 */
function plexPosterUrl(item: PlexMediaItem, tmdbId: number, inLibrary: boolean): string | null {
  if (inLibrary) return `/media/images/movie/${tmdbId}/poster.jpg`;
  return item.thumbUrl;
}

/** Extract a numeric TMDB id from a Plex item's external-id (Guid) array. */
function extractTmdbId(item: PlexMediaItem): number | null {
  const tmdbGuid = item.externalIds.find((id) => id.source === 'tmdb');
  if (!tmdbGuid) return null;
  const parsed = Number.parseInt(tmdbGuid.id, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

/** Map a Plex Discover item to a {@link DiscoverResult}, or null without a TMDB id. */
function toDiscoverResult(item: PlexMediaItem, flags: FlagSets): DiscoverResult | null {
  const tmdbId = extractTmdbId(item);
  if (tmdbId === null) return null;

  const inLibrary = flags.libraryIds.has(tmdbId);
  return {
    tmdbId,
    title: item.title,
    overview: item.summary ?? '',
    releaseDate: item.year ? `${item.year}-01-01` : '',
    posterPath: null,
    posterUrl: plexPosterUrl(item, tmdbId, inLibrary),
    backdropPath: null,
    voteAverage: item.audienceRating ?? 0,
    voteCount: 0,
    genreIds: [],
    popularity: 0,
    inLibrary,
    isWatched: flags.watchedIds.has(tmdbId),
    onWatchlist: flags.watchlistIds.has(tmdbId),
  };
}

/**
 * Fetch trending movies from the Plex Discover API, enriched with library /
 * watched / watchlist flags and with dismissed + duplicate items filtered out.
 *
 * Returns `null` when Plex is not connected (no token), so the caller can hide
 * the surface entirely instead of rendering an empty shelf.
 */
export async function getTrendingFromPlex(
  db: MediaDb,
  limit: number = DEFAULT_PLEX_TRENDING_LIMIT
): Promise<DiscoverResult[] | null> {
  const token = getPlexToken(db);
  if (token === null) return null;

  const plexItems = await getPlexDiscoverTrending(token, limit + FILTER_HEADROOM);
  const flags = loadFlagSets(db);

  const results: DiscoverResult[] = [];
  const seenTmdbIds = new Set<number>();
  for (const item of plexItems) {
    const result = toDiscoverResult(item, flags);
    if (result === null) continue;
    if (flags.dismissedIds.has(result.tmdbId)) continue;
    if (seenTmdbIds.has(result.tmdbId)) continue;
    seenTmdbIds.add(result.tmdbId);
    results.push(result);
    if (results.length >= limit) break;
  }
  return results;
}
