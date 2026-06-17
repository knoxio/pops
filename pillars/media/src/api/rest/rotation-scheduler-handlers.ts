/**
 * Handlers for the `rotation.*` scheduler routes (slice 11b) — drive the
 * module-level singleton `rotationScheduler` controller. `toggle` / `run-now`
 * / `status` all touch the SAME timer the `server.ts` boot path uses, so a
 * scheduler resumed on boot can be observed + stopped over REST and vice-versa.
 *
 * `disk-space` degrades to `{ available: false, disks: [] }` when Radarr is
 * unconfigured or unreachable (parity with the monolith); `cancelLeaving`
 * returns `success:false` rather than 404 when the movie is not `leaving`.
 */
import { type MediaDb, rotationLogService, rotationRemovalQueries } from '../../db/index.js';
import { getRadarrClient, type RadarrDiskSpace } from '../clients/arr/index.js';
import { rotationScheduler } from '../cron/rotation-scheduler.js';
import { runHttp } from './error-mapping.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { mediaRotationContract } from '../../contract/rest-rotation.js';

type Req = ServerInferRequest<typeof mediaRotationContract>;

async function readDiskSpace(): Promise<{ available: boolean; disks: RadarrDiskSpace[] }> {
  try {
    const client = getRadarrClient();
    if (!client) return { available: false, disks: [] };
    return { available: true, disks: await client.getDiskSpace() };
  } catch {
    return { available: false, disks: [] };
  }
}

const DEFAULT_LOG_LIMIT = 20;
const DEFAULT_LOG_OFFSET = 0;

export function makeRotationSchedulerHandlers(db: MediaDb) {
  return {
    schedulerStatus: () =>
      runHttp(() => ({ status: 200 as const, body: { data: rotationScheduler.status(db) } })),

    schedulerToggle: ({ body }: Req['schedulerToggle']) =>
      runHttp(() => {
        const data = body.enabled
          ? rotationScheduler.start({ db, cronExpression: body.cronExpression })
          : rotationScheduler.stop(db);
        return { status: 200 as const, body: { data } };
      }),

    schedulerRunNow: () =>
      runHttp(async () => {
        if (rotationScheduler.status(db).isCycleRunning) {
          return { status: 200 as const, body: { data: { success: false, result: null } } };
        }
        await rotationScheduler.runOnce(db);
        const result = rotationLogService.lastCycleLog(db);
        return {
          status: 200 as const,
          body: {
            data: {
              success: true,
              result:
                result === null
                  ? null
                  : {
                      moviesMarkedLeaving: result.moviesMarkedLeaving,
                      moviesRemoved: result.moviesRemoved,
                      moviesAdded: result.moviesAdded,
                      removalsFailed: result.removalsFailed,
                      freeSpaceGb: result.freeSpaceGb,
                      targetFreeGb: result.targetFreeGb,
                      skippedReason: result.skippedReason,
                    },
            },
          },
        };
      }),

    schedulerLeavingMovies: () =>
      runHttp(() => ({
        status: 200 as const,
        body: { data: rotationRemovalQueries.getLeavingMovies(db) },
      })),

    schedulerCancelLeaving: ({ params }: Req['schedulerCancelLeaving']) =>
      runHttp(() => {
        const updated = rotationRemovalQueries.cancelLeaving(db, params.movieId);
        return {
          status: 200 as const,
          body: {
            data: {
              success: updated,
              message: updated ? 'Leaving status cancelled' : 'Movie not found or not leaving',
            },
          },
        };
      }),

    schedulerLastCycleLog: () =>
      runHttp(() => ({
        status: 200 as const,
        body: { data: rotationLogService.lastCycleLog(db) },
      })),

    schedulerDiskSpace: () =>
      runHttp(async () => ({ status: 200 as const, body: { data: await readDiskSpace() } })),

    listRotationLog: ({ query }: Req['listRotationLog']) =>
      runHttp(() => ({
        status: 200 as const,
        body: {
          data: rotationLogService.listRotationLog(
            db,
            query.limit ?? DEFAULT_LOG_LIMIT,
            query.offset ?? DEFAULT_LOG_OFFSET
          ),
        },
      })),

    rotationLogStats: () =>
      runHttp(() => ({
        status: 200 as const,
        body: { data: rotationLogService.getRotationLogStats(db) },
      })),
  };
}
