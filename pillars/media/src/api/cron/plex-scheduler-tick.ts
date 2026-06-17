/**
 * One periodic-sync tick for the Plex scheduler (slice 9c).
 *
 * Resolves the Plex client + section ids once, runs the movies / tv /
 * watchlist 9b sync ops, collects per-op counts and error strings, and
 * persists a single `sync_logs` row with the tick duration. Returns the
 * tick summary so the controller can refresh its in-memory status.
 *
 * Gate: this runs ONLY movies / tv / watchlist. The Plex Discover watch
 * sync is deferred to wave 3 (it needs the Discover client + rotation
 * domain) and is intentionally absent here.
 *
 * Section-id resolution is `arg ?? plex_settings`. A missing section id
 * skips that op (no movies/tv to import) rather than erroring the tick —
 * watchlist sync needs no section id and still runs.
 */
import { type MediaDb, syncLogsService } from '../../db/index.js';
import {
  type PlexClient,
  getPlexClient,
  getPlexClientId,
  getPlexSectionIds,
  getPlexToken,
} from '../clients/plex/index.js';
import {
  importMoviesFromPlex,
  importTvShowsFromPlex,
  syncWatchlistFromPlex,
} from '../clients/plex/sync/index.js';
import { getTvdbClient } from '../clients/thetvdb/index.js';
import { getImageCache, getTmdbClient } from '../clients/tmdb/index.js';

export interface PlexTickResult {
  syncedAt: string;
  moviesSynced: number;
  tvShowsSynced: number;
  errors: string[];
  durationMs: number;
}

export interface PlexTickOptions {
  movieSectionId?: string;
  tvSectionId?: string;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function runMovies(
  db: MediaDb,
  plexClient: PlexClient,
  sectionId: string | null,
  errors: string[]
): Promise<number> {
  if (sectionId === null) return 0;
  try {
    const progress = await importMoviesFromPlex(
      { db, plexClient, tmdbClient: getTmdbClient() },
      sectionId
    );
    for (const e of progress.errors) errors.push(`movie:${e.title}: ${e.reason}`);
    return progress.synced;
  } catch (err) {
    errors.push(`movies: ${errorMessage(err)}`);
    return 0;
  }
}

async function runTvShows(
  db: MediaDb,
  plexClient: PlexClient,
  sectionId: string | null,
  errors: string[]
): Promise<number> {
  if (sectionId === null) return 0;
  try {
    const progress = await importTvShowsFromPlex(
      { db, plexClient, tvdbClient: getTvdbClient(), imageCache: getImageCache() },
      sectionId
    );
    for (const e of progress.errors) errors.push(`tv:${e.title}: ${e.reason}`);
    return progress.synced;
  } catch (err) {
    errors.push(`tvShows: ${errorMessage(err)}`);
    return 0;
  }
}

async function runWatchlist(db: MediaDb, errors: string[]): Promise<void> {
  const token = getPlexToken(db);
  if (token === null) return;
  try {
    const progress = await syncWatchlistFromPlex({
      db,
      token,
      clientId: getPlexClientId(db),
      tmdbClient: getTmdbClient(),
      tvdbClient: getTvdbClient(),
      imageCache: getImageCache(),
    });
    for (const e of progress.errors) errors.push(`watchlist:${e.title}: ${e.reason}`);
  } catch (err) {
    errors.push(`watchlist: ${errorMessage(err)}`);
  }
}

/**
 * Run a single sync tick and persist a `sync_logs` row. A `null` Plex
 * client (not configured) writes an error log and returns immediately.
 */
export async function runPlexSyncTick(
  db: MediaDb,
  options: PlexTickOptions = {}
): Promise<PlexTickResult> {
  const startedAt = Date.now();
  const syncedAt = new Date(startedAt).toISOString();
  const plexClient = getPlexClient(db);

  if (plexClient === null) {
    const result: PlexTickResult = {
      syncedAt,
      moviesSynced: 0,
      tvShowsSynced: 0,
      errors: ['Plex is not configured'],
      durationMs: Date.now() - startedAt,
    };
    syncLogsService.writeSyncLog(db, result);
    return result;
  }

  const saved = getPlexSectionIds(db);
  const movieSectionId = options.movieSectionId ?? saved.movieSectionId;
  const tvSectionId = options.tvSectionId ?? saved.tvSectionId;
  const errors: string[] = [];

  const moviesSynced = await runMovies(db, plexClient, movieSectionId, errors);
  const tvShowsSynced = await runTvShows(db, plexClient, tvSectionId, errors);
  await runWatchlist(db, errors);

  const result: PlexTickResult = {
    syncedAt,
    moviesSynced,
    tvShowsSynced,
    errors,
    durationMs: Date.now() - startedAt,
  };
  syncLogsService.writeSyncLog(db, result);
  return result;
}
