import { eq } from 'drizzle-orm';

import { movies } from '@pops/db-types';

import { addMovie } from '../library/service.js';
import { logWatch } from '../watch-history/service.js';
import {
  delay,
  pushError,
  RATE_LIMIT_DELAY_MS,
  type DiscoverItemResult,
} from './sync-discover-types.js';
import { extractExternalIdAsNumber } from './sync-helpers.js';

import type { getDrizzle } from '../../../db.js';
import type { getImageCache, getTmdbClient } from '../tmdb/index.js';
import type { PlexClient } from './client.js';
import type { ActivityWatchEntry } from './sync-discover-graphql.js';

export type MovieByRatingKey = Map<string, { id: number; title: string; tmdbId: number }>;
export type MovieByTmdbId = Map<number, { id: number; title: string }>;

export interface ProcessMovieEntryArgs {
  entry: ActivityWatchEntry;
  plexClient: PlexClient;
  tmdbClient: ReturnType<typeof getTmdbClient>;
  imageCache: ReturnType<typeof getImageCache>;
  movieByRatingKey: MovieByRatingKey;
  movieByTmdbId: MovieByTmdbId;
  result: DiscoverItemResult;
  db: ReturnType<typeof getDrizzle>;
}

interface ResolveMovieArgs {
  ratingKey: string;
  plexClient: PlexClient;
  tmdbClient: ReturnType<typeof getTmdbClient>;
  imageCache: ReturnType<typeof getImageCache>;
  movieByRatingKey: MovieByRatingKey;
  movieByTmdbId: MovieByTmdbId;
  result: DiscoverItemResult;
  db: ReturnType<typeof getDrizzle>;
}

async function resolveMovie(
  args: ResolveMovieArgs
): Promise<{ id: number; title: string; tmdbId: number } | null> {
  const {
    ratingKey,
    plexClient,
    tmdbClient,
    imageCache,
    movieByRatingKey,
    movieByTmdbId,
    result,
    db,
  } = args;

  await delay(RATE_LIMIT_DELAY_MS);
  const meta = await plexClient.getDiscoverMetadata(ratingKey);
  if (!meta) {
    result.notFound++;
    return null;
  }

  const tmdbId = extractExternalIdAsNumber(meta, 'tmdb');
  if (!tmdbId) {
    result.notFound++;
    return null;
  }

  const existing = movieByTmdbId.get(tmdbId);
  if (existing) {
    db.update(movies).set({ discoverRatingKey: ratingKey }).where(eq(movies.id, existing.id)).run();
    const movie = { ...existing, tmdbId };
    movieByRatingKey.set(ratingKey, movie);
    return movie;
  }

  const { movie: newMovie } = await addMovie(tmdbId, tmdbClient, imageCache);
  db.update(movies).set({ discoverRatingKey: ratingKey }).where(eq(movies.id, newMovie.id)).run();
  const movie = { id: newMovie.id, title: newMovie.title, tmdbId };
  movieByRatingKey.set(ratingKey, movie);
  movieByTmdbId.set(tmdbId, { id: newMovie.id, title: newMovie.title });
  result.added++;
  return movie;
}

/**
 * Process a MOVIE watch entry from the Plex Discover activity feed.
 *
 * 1. Check if the movie is already in the library (by cached ratingKey)
 * 2. If not, resolve the Discover ratingKey → TMDB ID → add to library
 * 3. Log the watch
 */
export async function processMovieEntry(args: ProcessMovieEntryArgs): Promise<void> {
  const { entry, movieByRatingKey, result } = args;
  const ratingKey = entry.metadataItem.id;
  const title = entry.metadataItem.title;

  try {
    let movie = movieByRatingKey.get(ratingKey);
    if (!movie) {
      const resolved = await resolveMovie({ ...args, ratingKey });
      if (!resolved) return;
      movie = resolved;
    }

    result.watched++;
    const logResult = logWatch({
      mediaType: 'movie',
      mediaId: movie.id,
      watchedAt: entry.date,
      completed: 1,
      source: 'plex_sync',
    });
    if (logResult.created) result.logged++;
    else result.alreadyLogged++;
  } catch (err) {
    pushError(result, title, err);
  }
}
