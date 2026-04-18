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

export async function process(job: Job<SyncQueueJobData>): Promise<unknown> {
  const { data } = job;
  logger.info({ jobId: job.id, type: data.type }, 'Sync job started');

  switch (data.type) {
    case 'plexSyncMovies': {
      const client = requirePlexClient();
      return importMoviesFromPlex(client, data.sectionId, {
        onProgress: async (p) => {
          await job.updateProgress({ processed: p.processed, total: p.total });
        },
      });
    }

    case 'plexSyncTvShows': {
      const client = requirePlexClient();
      return importTvShowsFromPlex(client, data.sectionId, {
        onProgress: async (p) => {
          await job.updateProgress({ processed: p.processed, total: p.total });
        },
      });
    }

    case 'plexSyncWatchlist': {
      const token = getPlexToken();
      if (!token) throw new Error('Plex token not available');
      return syncWatchlistFromPlex(token, {
        onProgress: async (p) => {
          await job.updateProgress({ processed: p.processed, total: p.total });
        },
      });
    }

    case 'plexSyncWatchHistory': {
      const client = requirePlexClient();
      return syncWatchHistoryFromPlex(
        client,
        data.movieSectionId,
        data.tvSectionId,
        async (processed, total) => {
          await job.updateProgress({ processed, total });
        }
      );
    }

    case 'plexSyncDiscoverWatches': {
      const client = requirePlexClient();
      return syncDiscoverWatches(
        client,
        async (processed, total) => {
          await job.updateProgress({ processed, total });
        },
        () => {
          // Partial result callback not needed — BullMQ job result returned on completion
        }
      );
    }

    case 'plexScheduledSync': {
      const client = requirePlexClient();
      const sectionIds = getPlexSectionIds();
      const movieSectionId = data.movieSectionId ?? sectionIds.movieSectionId;
      const tvSectionId = data.tvSectionId ?? sectionIds.tvSectionId;

      const errors: string[] = [];
      let movieCount = 0;
      let tvCount = 0;

      if (movieSectionId) {
        const result = await importMoviesFromPlex(client, movieSectionId);
        movieCount = result.synced;
        for (const err of result.errors) errors.push(`Movie: ${err.title} — ${err.reason}`);
      } else {
        logger.warn('Movie section ID not configured — skipping movie sync');
      }

      if (tvSectionId) {
        const result = await importTvShowsFromPlex(client, tvSectionId);
        tvCount = result.synced;
        for (const err of result.errors) errors.push(`TV: ${err.title} — ${err.reason}`);
      } else {
        logger.warn('TV section ID not configured — skipping TV sync');
      }

      const token = getPlexToken();
      if (token) {
        try {
          const result = await syncWatchlistFromPlex(token);
          for (const err of result.errors) errors.push(`Watchlist: ${err.title} — ${err.reason}`);
        } catch (err) {
          errors.push(`Watchlist sync failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      return { movieCount, tvCount, errors };
    }

    default: {
      // Exhaustive check — TypeScript will catch unhandled cases at compile time
      const _exhaustive: never = data;
      throw new Error(`Unknown sync job type: ${(_exhaustive as { type: string }).type}`);
    }
  }
}

function requirePlexClient(): ReturnType<typeof getPlexClient> & object {
  const client = getPlexClient();
  if (!client) throw new Error('Plex is not configured');
  return client;
}
