/**
 * Handlers for the `plex.*` scheduler routes (slice 9c) — drive the
 * module-level singleton `plexScheduler` controller. `start`/`stop`/`status`
 * all touch the SAME timer the `server.ts` boot path uses, so a scheduler
 * resumed on boot can be observed + stopped over REST and vice-versa.
 */
import { type MediaDb, syncLogsService } from '../../db/index.js';
import { plexScheduler } from '../cron/plex-scheduler.js';
import { runHttp } from './error-mapping.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { mediaPlexContract } from '../../contract/rest-plex.js';

type Req = ServerInferRequest<typeof mediaPlexContract>;

export function makePlexSchedulerHandlers(db: MediaDb) {
  return {
    startScheduler: ({ body }: Req['startScheduler']) =>
      runHttp(() => {
        const data = plexScheduler.start({
          db,
          intervalMs: body.intervalMs,
          movieSectionId: body.movieSectionId,
          tvSectionId: body.tvSectionId,
        });
        return { status: 200 as const, body: { data } };
      }),

    stopScheduler: () =>
      runHttp(() => {
        plexScheduler.stop();
        return { status: 200 as const, body: { data: plexScheduler.status(db) } };
      }),

    getSchedulerStatus: () =>
      runHttp(() => ({ status: 200 as const, body: { data: plexScheduler.status(db) } })),

    getSyncLogs: ({ query }: Req['getSyncLogs']) =>
      runHttp(() => ({
        status: 200 as const,
        body: { data: syncLogsService.listSyncLogs(db, query.limit ?? 20) },
      })),
  };
}
