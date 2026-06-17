/**
 * Plex movie import — iterate a Plex movie section, match each item to a
 * TMDB id (via Plex Guid or title+year search), add to the local library,
 * and log watch history for watched items.
 *
 * Ported from the monolith `media/plex/sync-movies.ts`. The monolith wrapped
 * each movie's writes in an explicit `getDrizzle().transaction(...)`; the
 * pillar's `createMovie` is a single atomic insert and `logMovieWatch`
 * self-transacts, so no outer transaction is needed here.
 */
import { type MediaDb, moviesService } from '../../../../db/index.js';
import { logMovieWatch } from './sync-helpers.js';

import type { TmdbClient } from '../../tmdb/client.js';
import type { PlexClient } from '../client.js';
import type { PlexMediaItem } from '../types.js';

export interface MovieSyncError {
  title: string;
  year: number | null;
  reason: string;
}

export interface MovieSyncProgress {
  total: number;
  processed: number;
  synced: number;
  skipped: number;
  errors: MovieSyncError[];
}

export interface MovieSyncOptions {
  onProgress?: (progress: MovieSyncProgress) => void;
}

export interface MovieSyncDeps {
  db: MediaDb;
  plexClient: PlexClient;
  tmdbClient: TmdbClient;
}

async function searchTmdbByTitleYear(
  title: string,
  year: number | null,
  tmdbClient: TmdbClient
): Promise<number | null> {
  try {
    const result = await tmdbClient.searchMovies(title);
    if (result.results.length === 0) return null;
    for (const r of result.results) {
      const titleMatch = r.title.toLowerCase() === title.toLowerCase();
      const yearMatch =
        year && r.releaseDate ? new Date(r.releaseDate).getFullYear() === year : true;
      if (titleMatch && yearMatch) return r.tmdbId;
    }
    const first = result.results[0];
    if (first && first.title.toLowerCase() === title.toLowerCase()) return first.tmdbId;
    return null;
  } catch {
    return null;
  }
}

async function resolveTmdbId(item: PlexMediaItem, tmdbClient: TmdbClient): Promise<number | null> {
  const plexTmdbId = item.externalIds.find((id) => id.source === 'tmdb');
  if (plexTmdbId) {
    const parsed = Number(plexTmdbId.id);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return searchTmdbByTitleYear(item.title, item.year, tmdbClient);
}

async function syncSingleMovie(
  db: MediaDb,
  item: PlexMediaItem,
  tmdbClient: TmdbClient,
  progress: MovieSyncProgress
): Promise<void> {
  const tmdbId = await resolveTmdbId(item, tmdbClient);
  if (!tmdbId) {
    progress.skipped++;
    return;
  }

  const existing = moviesService.getMovieByTmdbId(db, tmdbId);
  if (existing) {
    if (item.viewCount > 0) logMovieWatch(db, existing.id, item.lastViewedAt);
    progress.synced++;
    return;
  }

  const detail = await tmdbClient.getMovie(tmdbId);
  const movie = moviesService.createMovie(db, {
    tmdbId: detail.tmdbId,
    imdbId: detail.imdbId,
    title: detail.title,
    originalTitle: detail.originalTitle,
    overview: detail.overview,
    tagline: detail.tagline,
    releaseDate: detail.releaseDate,
    runtime: detail.runtime,
    status: detail.status,
    originalLanguage: detail.originalLanguage,
    budget: detail.budget,
    revenue: detail.revenue,
    posterPath: detail.posterPath,
    backdropPath: detail.backdropPath,
    voteAverage: detail.voteAverage,
    voteCount: detail.voteCount,
    genres: detail.genres.map((g) => g.name),
  });
  if (item.viewCount > 0) logMovieWatch(db, movie.id, item.lastViewedAt);
  progress.synced++;
}

/** Import all movies from a Plex library section. */
export async function importMoviesFromPlex(
  deps: MovieSyncDeps,
  sectionId: string,
  options: MovieSyncOptions = {}
): Promise<MovieSyncProgress> {
  const { db, plexClient, tmdbClient } = deps;
  const items = await plexClient.getAllItems(sectionId);
  const progress: MovieSyncProgress = {
    total: items.length,
    processed: 0,
    synced: 0,
    skipped: 0,
    errors: [],
  };

  for (const item of items) {
    try {
      await syncSingleMovie(db, item, tmdbClient, progress);
    } catch (err) {
      progress.errors.push({
        title: item.title,
        year: item.year,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
    progress.processed++;
    options.onProgress?.(progress);
  }
  return progress;
}
