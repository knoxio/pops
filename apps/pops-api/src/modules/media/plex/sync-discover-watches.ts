import { movies } from '@pops/db-types';

import { getDrizzle } from '../../../db.js';
import { getTvdbClient } from '../thetvdb/index.js';
import { getImageCache, getTmdbClient } from '../tmdb/index.js';
import { getPlexToken } from './service.js';
import { processEpisodeEntry, type ShowCache } from './sync-discover-episode.js';
import {
  fetchAccountUuid,
  fetchWatchHistoryPage,
  type ActivityWatchEntry,
} from './sync-discover-graphql.js';
import {
  processMovieEntry,
  type MovieByRatingKey,
  type MovieByTmdbId,
} from './sync-discover-movie.js';
import {
  makeEmptyResult,
  type DiscoverItemResult,
  type DiscoverWatchSyncResult,
} from './sync-discover-types.js';

import type { PlexClient } from './client.js';

export type {
  DiscoverItemResult,
  DiscoverMovieResult,
  DiscoverTvShowResult,
  DiscoverWatchSyncResult,
} from './sync-discover-types.js';

export { checkAndLogMovieWatch } from './sync-discover-check.js';

interface MovieLookupMaps {
  movieByRatingKey: MovieByRatingKey;
  movieByTmdbId: MovieByTmdbId;
}

function buildMovieLookupMaps(): MovieLookupMaps {
  const db = getDrizzle();
  const allMovies = db
    .select({
      id: movies.id,
      title: movies.title,
      tmdbId: movies.tmdbId,
      discoverRatingKey: movies.discoverRatingKey,
    })
    .from(movies)
    .all();

  const movieByRatingKey: MovieByRatingKey = new Map();
  const movieByTmdbId: MovieByTmdbId = new Map();
  for (const m of allMovies) {
    if (m.discoverRatingKey) {
      movieByRatingKey.set(m.discoverRatingKey, { id: m.id, title: m.title, tmdbId: m.tmdbId });
    }
    movieByTmdbId.set(m.tmdbId, { id: m.id, title: m.title });
  }
  return { movieByRatingKey, movieByTmdbId };
}

interface ProcessEntryContext {
  plexClient: PlexClient;
  tmdbClient: ReturnType<typeof getTmdbClient>;
  tvdbClient: ReturnType<typeof getTvdbClient>;
  imageCache: ReturnType<typeof getImageCache>;
  movieResult: DiscoverItemResult;
  tvResult: DiscoverItemResult;
  movieByRatingKey: MovieByRatingKey;
  movieByTmdbId: MovieByTmdbId;
  showCache: ShowCache;
}

async function dispatchEntry(entry: ActivityWatchEntry, ctx: ProcessEntryContext): Promise<void> {
  const db = getDrizzle();
  const type = entry.metadataItem.type;
  if (type === 'MOVIE') {
    ctx.movieResult.total++;
    await processMovieEntry({
      entry,
      plexClient: ctx.plexClient,
      tmdbClient: ctx.tmdbClient,
      imageCache: ctx.imageCache,
      movieByRatingKey: ctx.movieByRatingKey,
      movieByTmdbId: ctx.movieByTmdbId,
      result: ctx.movieResult,
      db,
    });
    return;
  }
  if (type === 'EPISODE') {
    ctx.tvResult.total++;
    await processEpisodeEntry({
      entry,
      plexClient: ctx.plexClient,
      tvdbClient: ctx.tvdbClient,
      imageCache: ctx.imageCache,
      showCache: ctx.showCache,
      result: ctx.tvResult,
      db,
    });
  }
}

function buildContext(plexClient: PlexClient): ProcessEntryContext {
  return {
    plexClient,
    tmdbClient: getTmdbClient(),
    tvdbClient: getTvdbClient(),
    imageCache: getImageCache(),
    movieResult: makeEmptyResult(),
    tvResult: makeEmptyResult(),
    showCache: new Map(),
    ...buildMovieLookupMaps(),
  };
}

/**
 * Sync watch history from the Plex community GraphQL API.
 *
 * Fetches the user's full activity history and for each entry:
 * - If the item is already in the POPS library → log the watch
 * - If not in the library → resolve metadata, add to library, then log
 */
export async function syncDiscoverWatches(
  plexClient: PlexClient,
  onProgress?: (processed: number, total: number) => void,
  onPartialResult?: (result: DiscoverWatchSyncResult) => void
): Promise<DiscoverWatchSyncResult> {
  const token = getPlexToken();
  if (!token) throw new Error('Plex token not available');

  const ctx = buildContext(plexClient);
  const uuid = await fetchAccountUuid(token);
  let after: string | null = null;
  let totalEntries = 0;
  let processedEntries = 0;
  let hasMore = true;

  while (hasMore) {
    const page = await fetchWatchHistoryPage(token, uuid, after);
    totalEntries = Math.max(
      totalEntries,
      processedEntries + page.nodes.length + (page.hasNextPage ? 1 : 0)
    );

    for (const entry of page.nodes) {
      await dispatchEntry(entry, ctx);
      processedEntries++;
      onProgress?.(processedEntries, totalEntries);
      onPartialResult?.({ movies: ctx.movieResult, tvShows: ctx.tvResult });
    }

    hasMore = page.hasNextPage;
    after = page.endCursor;
  }

  return { movies: ctx.movieResult, tvShows: ctx.tvResult };
}
