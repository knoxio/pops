/**
 * Handlers for the `watchlist.*` sub-router.
 *
 * Thin wrappers over `@pops/media` `watchlistService`. List rows are served
 * without the legacy `title`/`posterUrl` enrichment (parity with the
 * pops-media-api shadow); db domain errors map to 404 / 409.
 */
import {
  type MediaDb,
  watchlistService,
  WatchlistEntryNotFoundError,
  WatchlistReorderConflictError,
} from '../../db/index.js';
import { toWatchlistEntry } from '../modules/watchlist-types.js';
import { ConflictError, NotFoundError } from '../shared/errors.js';
import { paginationMeta } from '../shared/pagination.js';
import { runHttp } from './error-mapping.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { mediaWatchlistContract } from '../../contract/rest-watchlist.js';

type Req = ServerInferRequest<typeof mediaWatchlistContract>;

const DEFAULT_LIMIT = 50;
const DEFAULT_OFFSET = 0;

const NULL_ENRICHMENT = { title: null, posterUrl: null } as const;

export function makeWatchlistHandlers(db: MediaDb) {
  return {
    list: ({ query }: Req['list']) =>
      runHttp(() => {
        const limit = query.limit ?? DEFAULT_LIMIT;
        const offset = query.offset ?? DEFAULT_OFFSET;
        const { rows, total } = watchlistService.listWatchlist(
          db,
          { mediaType: query.mediaType },
          limit,
          offset
        );
        return {
          status: 200 as const,
          body: {
            data: rows.map((row) => toWatchlistEntry({ ...row, ...NULL_ENRICHMENT })),
            pagination: paginationMeta(total, limit, offset),
          },
        };
      }),

    status: ({ query }: Req['status']) =>
      runHttp(() => ({
        status: 200 as const,
        body: watchlistService.getWatchlistStatus(db, query.mediaType, query.mediaId),
      })),

    get: ({ params }: Req['get']) =>
      runHttp(() => {
        try {
          const row = watchlistService.getWatchlistEntry(db, params.id);
          return {
            status: 200 as const,
            body: { data: toWatchlistEntry({ ...row, ...NULL_ENRICHMENT }) },
          };
        } catch (err) {
          if (err instanceof WatchlistEntryNotFoundError)
            throw new NotFoundError('Watchlist entry', String(params.id));
          throw err;
        }
      }),

    add: ({ body }: Req['add']) =>
      runHttp(() => {
        const { row, created } = watchlistService.addToWatchlist(db, body);
        return {
          status: 201 as const,
          body: {
            data: toWatchlistEntry({ ...row, ...NULL_ENRICHMENT }),
            created,
            message: created ? 'Added to watchlist' : 'Already on watchlist',
          },
        };
      }),

    reorder: ({ body }: Req['reorder']) =>
      runHttp(() => {
        try {
          watchlistService.reorderWatchlist(db, body.items);
          return { status: 200 as const, body: { message: 'Watchlist reordered' } };
        } catch (err) {
          if (err instanceof WatchlistEntryNotFoundError)
            throw new NotFoundError('Watchlist entry', String(err.entryId));
          if (err instanceof WatchlistReorderConflictError) throw new ConflictError(err.message);
          throw err;
        }
      }),

    update: ({ params, body }: Req['update']) =>
      runHttp(() => {
        try {
          const row = watchlistService.updateWatchlistEntry(db, params.id, body);
          return {
            status: 200 as const,
            body: {
              data: toWatchlistEntry({ ...row, ...NULL_ENRICHMENT }),
              message: 'Watchlist entry updated',
            },
          };
        } catch (err) {
          if (err instanceof WatchlistEntryNotFoundError)
            throw new NotFoundError('Watchlist entry', String(params.id));
          throw err;
        }
      }),

    remove: ({ params }: Req['remove']) =>
      runHttp(() => {
        try {
          watchlistService.removeFromWatchlist(db, params.id);
          return { status: 200 as const, body: { message: 'Removed from watchlist' } };
        } catch (err) {
          if (err instanceof WatchlistEntryNotFoundError)
            throw new NotFoundError('Watchlist entry', String(params.id));
          throw err;
        }
      }),
  };
}
