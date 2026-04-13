/**
 * Plex watchlist push — resolves Plex Discover ratingKeys for manually added
 * watchlist items so they can be pushed to the Plex cloud watchlist.
 */
import { mediaWatchlist } from '@pops/db-types';
import { eq } from 'drizzle-orm';

import { getDrizzle } from '../../../db.js';
import { getMovie } from '../movies/service.js';
import type { PlexClient as PlexClientType } from '../plex/client.js';
import { getPlexClient } from '../plex/service.js';
import { findDiscoverMatch } from '../plex/sync-helpers.js';
import { getTvShow } from '../tv-shows/service.js';

/**
 * Look up a Plex Discover ratingKey for a local media item by searching the
 * Plex Discover API and matching on TMDB/TVDB ID.
 *
 * Returns the ratingKey string, or null if not found.
 */
export async function lookupPlexRatingKey(
  mediaType: 'movie' | 'tv_show',
  mediaId: number
): Promise<string | null> {
  const client = getPlexClient();
  if (!client) return null;

  if (mediaType === 'movie') {
    return lookupMovieRatingKey(client, mediaId);
  } else {
    return lookupTvShowRatingKey(client, mediaId);
  }
}

async function lookupMovieRatingKey(
  client: PlexClientType,
  movieId: number
): Promise<string | null> {
  const movie = getMovie(movieId);
  const results = await client.searchDiscover(movie.title, 'movie');
  return findDiscoverMatch(client, results, 'tmdb', movie.tmdbId);
}

async function lookupTvShowRatingKey(
  client: PlexClientType,
  tvShowId: number
): Promise<string | null> {
  const show = getTvShow(tvShowId);
  const results = await client.searchDiscover(show.name, 'show');
  return findDiscoverMatch(client, results, 'tvdb', show.tvdbId);
}

/**
 * Push a watchlist item to Plex and store the ratingKey.
 * Best-effort — failures are logged but do not throw.
 */
export async function pushToPlexWatchlist(
  watchlistId: number,
  mediaType: 'movie' | 'tv_show',
  mediaId: number
): Promise<void> {
  try {
    const ratingKey = await lookupPlexRatingKey(mediaType, mediaId);
    if (!ratingKey) {
      console.warn(`[Plex] No Discover ratingKey found for ${mediaType}/${mediaId}`);
      return;
    }

    const client = getPlexClient();
    if (!client) return;

    await client.addToWatchlist(ratingKey);

    // Persist the ratingKey so future remove operations work
    getDrizzle()
      .update(mediaWatchlist)
      .set({ plexRatingKey: ratingKey })
      .where(eq(mediaWatchlist.id, watchlistId))
      .run();

    console.warn(
      `[Plex] Pushed watchlist add for ${mediaType}/${mediaId} (ratingKey=${ratingKey})`
    );
  } catch (err) {
    console.warn(
      `[Plex] Failed to push watchlist add for ${mediaType}/${mediaId}:`,
      err instanceof Error ? err.message : err
    );
  }
}
