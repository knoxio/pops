/**
 * Handlers for the `comparisons.*` sub-router — the ranking engine.
 *
 * Thin wrappers over the `@pops/media` comparisons services: parse → service
 * call → map → typed envelope. Db domain errors are translated to the shared
 * HttpError subclasses via `guard` (see `comparisons-handlers-shared.ts`).
 * The score / ranking / staleness / tier-list half lives in
 * `comparisons-handlers-scores.ts` and is composed in here.
 */
import { comparisonsService, type MediaDb } from '../../db/index.js';
import { paginationMeta } from '../shared/pagination.js';
import { guard } from './comparisons-handlers-shared.js';
import { makeComparisonsScoreHandlers } from './comparisons-scores-handlers.js';
import { runHttp } from './error-mapping.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { mediaComparisonsContract } from '../../contract/rest-comparisons.js';

type Req = ServerInferRequest<typeof mediaComparisonsContract>;

const DEFAULT_OFFSET = 0;

export function makeComparisonsHandlers(db: MediaDb) {
  const defaultLimit = comparisonsService.getDefaultLimit();

  return {
    listDimensions: () =>
      runHttp(() => ({
        status: 200 as const,
        body: { data: comparisonsService.listDimensions(db).map(comparisonsService.toDimension) },
      })),

    createDimension: ({ body }: Req['createDimension']) =>
      runHttp(() =>
        guard(() => ({
          status: 201 as const,
          body: {
            data: comparisonsService.toDimension(comparisonsService.createDimension(db, body)),
            message: 'Dimension created',
          },
        }))
      ),

    updateDimension: ({ params, body }: Req['updateDimension']) =>
      runHttp(() =>
        guard(() => ({
          status: 200 as const,
          body: {
            data: comparisonsService.toDimension(
              comparisonsService.updateDimension(db, params.id, body)
            ),
            message: 'Dimension updated',
          },
        }))
      ),

    record: ({ body }: Req['record']) =>
      runHttp(() =>
        guard(() => ({
          status: 201 as const,
          body: {
            data: comparisonsService.toComparison(comparisonsService.recordComparison(db, body)),
            message: 'Comparison recorded',
          },
        }))
      ),

    listForMedia: ({ query }: Req['listForMedia']) =>
      runHttp(() => {
        const limit = query.limit ?? defaultLimit;
        const offset = query.offset ?? DEFAULT_OFFSET;
        const { rows, total } = comparisonsService.listComparisonsForMedia(db, {
          mediaType: query.mediaType,
          mediaId: query.mediaId,
          dimensionId: query.dimensionId,
          limit,
          offset,
        });
        return {
          status: 200 as const,
          body: {
            data: rows.map(comparisonsService.toComparison),
            pagination: paginationMeta(total, limit, offset),
          },
        };
      }),

    listAll: ({ query }: Req['listAll']) =>
      runHttp(() => {
        const limit = query.limit ?? defaultLimit;
        const offset = query.offset ?? DEFAULT_OFFSET;
        const { rows, total } = comparisonsService.listAllComparisons(db, {
          dimensionId: query.dimensionId,
          search: query.search,
          limit,
          offset,
        });
        return {
          status: 200 as const,
          body: {
            data: rows.map(comparisonsService.toComparison),
            pagination: paginationMeta(total, limit, offset),
          },
        };
      }),

    delete: ({ params }: Req['delete']) =>
      runHttp(() =>
        guard(() => {
          comparisonsService.deleteComparison(db, params.id);
          return {
            status: 200 as const,
            body: { message: 'Comparison deleted and scores recalculated' },
          };
        })
      ),

    blacklistMovie: ({ body }: Req['blacklistMovie']) =>
      runHttp(() => ({
        status: 200 as const,
        body: {
          data: comparisonsService.blacklistMovie(db, body.mediaType, body.mediaId),
          message: 'Movie blacklisted and comparisons purged',
        },
      })),

    batchRecordComparisons: ({ body }: Req['batchRecordComparisons']) =>
      runHttp(() =>
        guard(() => {
          const result = comparisonsService.batchRecordComparisons(
            db,
            body.dimensionId,
            body.comparisons
          );
          return {
            status: 201 as const,
            body: { data: result, message: `${result.count} comparisons recorded` },
          };
        })
      ),

    recordSkip: ({ body }: Req['recordSkip']) =>
      runHttp(() => ({
        status: 200 as const,
        body: {
          data: { skipUntil: comparisonsService.recordSkip(db, body) },
          message: 'Skip recorded',
        },
      })),

    getSmartPair: ({ query }: Req['getSmartPair']) =>
      runHttp(() =>
        guard(() => {
          const pair = comparisonsService.getSmartPair(db, query.dimensionId);
          if (pair) return { status: 200 as const, body: { data: pair, reason: null } };
          if (query.dimensionId !== undefined) {
            const randomPair = comparisonsService.getRandomPair(db, query.dimensionId);
            if (randomPair) {
              return {
                status: 200 as const,
                body: { data: { ...randomPair, dimensionId: query.dimensionId }, reason: null },
              };
            }
          }
          return {
            status: 200 as const,
            body: { data: null, reason: 'insufficient_watched_movies' as const },
          };
        })
      ),

    recalcAll: () =>
      runHttp(() => {
        const count = comparisonsService.recalcAllDimensions(db);
        return {
          status: 200 as const,
          body: {
            data: { dimensionsRecalculated: count },
            message: `Recalculated ${count} dimensions`,
          },
        };
      }),

    ...makeComparisonsScoreHandlers(db),
  };
}
