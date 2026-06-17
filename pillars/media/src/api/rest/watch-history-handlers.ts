/**
 * Handlers for the `watch-history.*` sub-router.
 *
 * Thin wrappers over the `@pops/media` watch-history services: parse →
 * service call → map → typed envelope. Db domain errors
 * (`WatchHistoryNotFoundError`, `TvShowNotFoundError`) are translated to the
 * shared `NotFoundError` the REST error mapping understands (404).
 *
 * The comparison-staleness reset the monolith ran on log / batchLog is
 * deferred until the comparisons domain is ported (wave 3) — see the db
 * service NOTE. Watch logging, watchlist auto-removal and resequence are
 * preserved.
 */
import {
  type MediaDb,
  TvShowNotFoundError,
  watchHistoryBatchService,
  watchHistoryLogService,
  watchHistoryProgressService,
  watchHistoryRecentService,
  watchHistoryService,
  WatchHistoryNotFoundError,
} from '../../db/index.js';
import { toWatchHistoryEntry } from '../modules/watch-history-types.js';
import { NotFoundError } from '../shared/errors.js';
import { paginationMeta } from '../shared/pagination.js';
import { runHttp } from './error-mapping.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { mediaWatchHistoryContract } from '../../contract/rest-watch-history.js';

type Req = ServerInferRequest<typeof mediaWatchHistoryContract>;

const DEFAULT_LIMIT = 50;
const DEFAULT_OFFSET = 0;

export function makeWatchHistoryHandlers(db: MediaDb) {
  return {
    list: ({ query }: Req['list']) =>
      runHttp(() => {
        const limit = query.limit ?? DEFAULT_LIMIT;
        const offset = query.offset ?? DEFAULT_OFFSET;
        const { rows, total } = watchHistoryService.list(
          db,
          { mediaType: query.mediaType, mediaId: query.mediaId },
          limit,
          offset
        );
        return {
          status: 200 as const,
          body: {
            data: rows.map(toWatchHistoryEntry),
            pagination: paginationMeta(total, limit, offset),
          },
        };
      }),

    listRecent: ({ query }: Req['listRecent']) =>
      runHttp(() => {
        const limit = query.limit ?? DEFAULT_LIMIT;
        const offset = query.offset ?? DEFAULT_OFFSET;
        const { rows, total } = watchHistoryRecentService.listRecent(
          db,
          { mediaType: query.mediaType, startDate: query.startDate, endDate: query.endDate },
          limit,
          offset
        );
        return {
          status: 200 as const,
          body: { data: rows, pagination: paginationMeta(total, limit, offset) },
        };
      }),

    progress: ({ params }: Req['progress']) =>
      runHttp(() => {
        try {
          return {
            status: 200 as const,
            body: { data: watchHistoryProgressService.getProgress(db, params.tvShowId) },
          };
        } catch (err) {
          if (err instanceof TvShowNotFoundError)
            throw new NotFoundError('TV show', String(params.tvShowId));
          throw err;
        }
      }),

    batchProgress: ({ body }: Req['batchProgress']) =>
      runHttp(() => ({
        status: 200 as const,
        body: { data: watchHistoryProgressService.getBatchProgress(db, body.tvShowIds) },
      })),

    get: ({ params }: Req['get']) =>
      runHttp(() => {
        try {
          const row = watchHistoryService.getById(db, params.id);
          return { status: 200 as const, body: { data: toWatchHistoryEntry(row) } };
        } catch (err) {
          if (err instanceof WatchHistoryNotFoundError)
            throw new NotFoundError('Watch history entry', String(params.id));
          throw err;
        }
      }),

    log: ({ body }: Req['log']) =>
      runHttp(() => {
        const { entry, watchlistRemoved } = watchHistoryLogService.logWatch(db, body);
        return {
          status: 201 as const,
          body: { data: toWatchHistoryEntry(entry), watchlistRemoved, message: 'Watch logged' },
        };
      }),

    batchLog: ({ body }: Req['batchLog']) =>
      runHttp(() => {
        const result = watchHistoryBatchService.batchLogWatch(db, body);
        return {
          status: 201 as const,
          body: {
            data: result,
            message: `Batch logged ${result.logged} episode(s), skipped ${result.skipped}`,
          },
        };
      }),

    delete: ({ params }: Req['delete']) =>
      runHttp(() => {
        try {
          watchHistoryService.delete(db, params.id);
          return { status: 200 as const, body: { message: 'Watch history entry deleted' } };
        } catch (err) {
          if (err instanceof WatchHistoryNotFoundError)
            throw new NotFoundError('Watch history entry', String(params.id));
          throw err;
        }
      }),
  };
}
