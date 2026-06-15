import { eq } from 'drizzle-orm';

/**
 * Plex watchlist push — resolves Plex Discover ratingKeys for manually added
 * watchlist items so they can be pushed to the Plex cloud watchlist.
 */
import { mediaWatchlist } from '@pops/media-db';

import { getDrizzle } from '../../../db.js';
import { getMovie } from '../movies/service.js';
import { getPlexClient } from '../plex/service.js';
import { findDiscoverMatch } from '../plex/sync-helpers.js';
import { getTvShow } from '../tv-shows/service.js';

import type { PlexClient as PlexClientType } from '../plex/client.js';

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
  const client = await getPlexClient();
  if (!client) return null;

  if (mediaType === 'movie') {
    return lookupMovieRatingKey(client, mediaId);
  }
  return lookupTvShowRatingKey(client, mediaId);
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
 *
 * Writes the resolved `plexRatingKey` back through `getDrizzle()` (the shared
 * `pops.db`) to match the store used by `watchlist/service.ts#addToWatchlist`,
 * which inserts the row this update targets. Routing this through
 * `getMediaDrizzle()` would target `media.db`, where the row does not yet
 * exist until the next boot-time backfill — the update would silently match
 * zero rows and `plex_rating_key` would be lost, so future removals could
 * not address the Plex side. TODO: move this to `getMediaDrizzle()` in the
 * sibling PR that migrates the remaining watchlist shim writes (PRD-167 PR4).
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

    const client = await getPlexClient();
    if (!client) return;

    await client.addToWatchlist(ratingKey);

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
