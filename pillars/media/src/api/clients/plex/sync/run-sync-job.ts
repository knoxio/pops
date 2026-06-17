/**
 * In-process sync-job dispatcher (slice 9b re-architecture).
 *
 * The monolith enqueued sync jobs to a `pops-sync` BullMQ queue processed by
 * a separate worker. The pillar has no Redis/BullMQ, so `startSyncJob`
 * (handler) fires this dispatcher with `void runSyncJob(...)` and persists the
 * outcome to `sync_job_results`. This module resolves the upstream clients +
 * section ids and runs the matching op, returning its result payload.
 *
 * `plexSyncDiscoverWatches` is intentionally unsupported here — it needs the
 * Plex Discover client + rotation domain, both deferred to wave 3.
 */
import { type MediaDb } from '../../../../db/index.js';
import { getTvdbClient } from '../../thetvdb/index.js';
import { getImageCache, getTmdbClient } from '../../tmdb/index.js';
import { getPlexClient, getPlexClientId, getPlexToken } from '../service.js';
import { importMoviesFromPlex } from './sync-movies.js';
import { importTvShowsFromPlex } from './sync-tv.js';
import { syncWatchHistoryFromPlex } from './sync-watch-history.js';
import { syncWatchlistFromPlex } from './sync-watchlist.js';
import { type StartSyncJobInput } from './types.js';

import type { PlexClient } from '../client.js';

function requireSectionId(sectionId: string | undefined, label: string): string {
  if (!sectionId) throw new Error(`sectionId is required for ${label}`);
  return sectionId;
}

function requirePlexClient(db: MediaDb): PlexClient {
  const client = getPlexClient(db);
  if (!client) throw new Error('Plex is not configured');
  return client;
}

async function runMovies(db: MediaDb, input: StartSyncJobInput): Promise<unknown> {
  const client = requirePlexClient(db);
  return importMoviesFromPlex(
    { db, plexClient: client, tmdbClient: getTmdbClient() },
    requireSectionId(input.sectionId, 'movie sync')
  );
}

async function runTvShows(db: MediaDb, input: StartSyncJobInput): Promise<unknown> {
  const client = requirePlexClient(db);
  return importTvShowsFromPlex(
    {
      db,
      plexClient: client,
      tvdbClient: getTvdbClient(),
      imageCache: getImageCache(),
    },
    requireSectionId(input.sectionId, 'TV sync')
  );
}

async function runWatchHistory(db: MediaDb, input: StartSyncJobInput): Promise<unknown> {
  const client = requirePlexClient(db);
  return syncWatchHistoryFromPlex(db, client, input.movieSectionId, input.tvSectionId);
}

async function runWatchlist(db: MediaDb): Promise<unknown> {
  requirePlexClient(db);
  const token = getPlexToken(db);
  if (!token) throw new Error('Plex is not configured');
  return syncWatchlistFromPlex({
    db,
    token,
    clientId: getPlexClientId(db),
    tmdbClient: getTmdbClient(),
    tvdbClient: getTvdbClient(),
    imageCache: getImageCache(),
  });
}

/**
 * Run a sync job synchronously (the caller fires it without awaiting).
 * Resolves to the op's result payload; rejects on any failure so the caller
 * can persist `failed` + the error message.
 */
export function runSyncJob(db: MediaDb, input: StartSyncJobInput): Promise<unknown> {
  switch (input.jobType) {
    case 'plexSyncMovies':
      return runMovies(db, input);
    case 'plexSyncTvShows':
      return runTvShows(db, input);
    case 'plexSyncWatchHistory':
      return runWatchHistory(db, input);
    case 'plexSyncWatchlist':
      return runWatchlist(db);
  }
}
