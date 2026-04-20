import pino from 'pino';

import {
  getPlexClient,
  getPlexSectionIds,
  getPlexToken,
} from '../../modules/media/plex/service.js';
import { syncDiscoverWatches } from '../../modules/media/plex/sync-discover-watches.js';
import { importMoviesFromPlex } from '../../modules/media/plex/sync-movies.js';
import { importTvShowsFromPlex } from '../../modules/media/plex/sync-tv.js';
import { syncWatchHistoryFromPlex } from '../../modules/media/plex/sync-watch-history.js';
import { syncWatchlistFromPlex } from '../../modules/media/plex/sync-watchlist.js';

import type { Job } from 'bullmq';

import type { SyncQueueJobData } from '../types.js';

const logger = pino({ name: 'worker:sync' });

type ProgressJob = { updateProgress(progress: unknown): Promise<void> };

function makeProgressCallback(
  job: ProgressJob
): (p: { processed: number; total: number }) => Promise<void> {
  return async (p) => {
    await job.updateProgress({ processed: p.processed, total: p.total });
  };
}

function makeTupleProgressCallback(
  job: ProgressJob
): (processed: number, total: number) => Promise<void> {
  return async (processed, total) => {
    await job.updateProgress({ processed, total });
  };
}

function requirePlexClient(): NonNullable<ReturnType<typeof getPlexClient>> {
  const client = getPlexClient();
  if (!client) throw new Error('Plex is not configured');
  return client;
}

async function runScheduledMoviesSync(
  client: NonNullable<ReturnType<typeof getPlexClient>>,
  movieSectionId: string | null | undefined,
  errors: string[]
): Promise<number> {
  if (!movieSectionId) {
    logger.warn('Movie section ID not configured — skipping movie sync');
    return 0;
  }
  const result = await importMoviesFromPlex(client, movieSectionId);
  for (const err of result.errors) errors.push(`Movie: ${err.title} — ${err.reason}`);
  return result.synced;
}

async function runScheduledTvSync(
  client: NonNullable<ReturnType<typeof getPlexClient>>,
  tvSectionId: string | null | undefined,
  errors: string[]
): Promise<number> {
  if (!tvSectionId) {
    logger.warn('TV section ID not configured — skipping TV sync');
    return 0;
  }
  const result = await importTvShowsFromPlex(client, tvSectionId);
  for (const err of result.errors) errors.push(`TV: ${err.title} — ${err.reason}`);
  return result.synced;
}

async function runScheduledWatchlistSync(errors: string[]): Promise<void> {
  const token = getPlexToken();
  if (!token) return;
  try {
    const result = await syncWatchlistFromPlex(token);
    for (const err of result.errors) errors.push(`Watchlist: ${err.title} — ${err.reason}`);
  } catch (err) {
    errors.push(`Watchlist sync failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function runScheduledSync(
  data: Extract<SyncQueueJobData, { type: 'plexScheduledSync' }>
): Promise<{ movieCount: number; tvCount: number; errors: string[] }> {
  const client = requirePlexClient();
  const sectionIds = getPlexSectionIds();
  const movieSectionId = data.movieSectionId ?? sectionIds.movieSectionId;
  const tvSectionId = data.tvSectionId ?? sectionIds.tvSectionId;

  const errors: string[] = [];
  const movieCount = await runScheduledMoviesSync(client, movieSectionId, errors);
  const tvCount = await runScheduledTvSync(client, tvSectionId, errors);
  await runScheduledWatchlistSync(errors);

  return { movieCount, tvCount, errors };
}

export async function process(job: Job<SyncQueueJobData>): Promise<unknown> {
  const { data } = job;
  logger.info({ jobId: job.id, type: data.type }, 'Sync job started');

  switch (data.type) {
    case 'plexSyncMovies': {
      const client = requirePlexClient();
      return importMoviesFromPlex(client, data.sectionId, {
        onProgress: makeProgressCallback(job),
      });
    }
    case 'plexSyncTvShows': {
      const client = requirePlexClient();
      return importTvShowsFromPlex(client, data.sectionId, {
        onProgress: makeProgressCallback(job),
      });
    }
    case 'plexSyncWatchlist': {
      const token = getPlexToken();
      if (!token) throw new Error('Plex token not available');
      return syncWatchlistFromPlex(token, { onProgress: makeProgressCallback(job) });
    }
    case 'plexSyncWatchHistory': {
      const client = requirePlexClient();
      return syncWatchHistoryFromPlex(
        client,
        data.movieSectionId ?? undefined,
        data.tvSectionId ?? undefined,
        makeTupleProgressCallback(job)
      );
    }
    case 'plexSyncDiscoverWatches': {
      const client = requirePlexClient();
      return syncDiscoverWatches(client, makeTupleProgressCallback(job), () => {
        // Partial result callback not needed — BullMQ job result returned on completion
      });
    }
    case 'plexScheduledSync':
      return runScheduledSync(data);
    default: {
      const _exhaustive: never = data;
      throw new Error(`Unknown sync job type: ${(_exhaustive as { type: string }).type}`);
    }
  }
}
