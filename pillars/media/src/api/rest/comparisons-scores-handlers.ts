/**
 * Score / ranking / staleness / tier-list handlers for the `comparisons.*`
 * sub-router. Split from `comparisons-handlers.ts` to keep both within the
 * per-file line cap; composed there.
 */
import { comparisonsService, type MediaDb } from '../../db/index.js';
import { paginationMeta } from '../shared/pagination.js';
import { guard } from './comparisons-handlers-shared.js';
import { runHttp } from './error-mapping.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { mediaComparisonsContract } from '../../contract/rest-comparisons.js';

type Req = ServerInferRequest<typeof mediaComparisonsContract>;

const DEFAULT_OFFSET = 0;

export function makeComparisonsScoreHandlers(db: MediaDb) {
  return {
    scores: ({ query }: Req['scores']) =>
      runHttp(() => ({
        status: 200 as const,
        body: {
          data: comparisonsService
            .getScoresForMedia(db, query.mediaType, query.mediaId, query.dimensionId)
            .map(comparisonsService.toMediaScore),
        },
      })),

    rankings: ({ query }: Req['rankings']) =>
      runHttp(() => {
        const limit = query.limit ?? comparisonsService.getDefaultLimit(db);
        const offset = query.offset ?? DEFAULT_OFFSET;
        const { rows, total } = comparisonsService.getRankings(db, {
          dimensionId: query.dimensionId,
          mediaType: query.mediaType,
          limit,
          offset,
        });
        return {
          status: 200 as const,
          body: { data: rows, pagination: paginationMeta(total, limit, offset) },
        };
      }),

    excludeFromDimension: ({ body }: Req['excludeFromDimension']) =>
      runHttp(() =>
        guard(() => ({
          status: 200 as const,
          body: comparisonsService.excludeFromDimension(
            db,
            body.mediaType,
            body.mediaId,
            body.dimensionId
          ),
        }))
      ),

    includeInDimension: ({ body }: Req['includeInDimension']) =>
      runHttp(() =>
        guard(() => {
          comparisonsService.includeInDimension(db, body.mediaType, body.mediaId, body.dimensionId);
          return { status: 200 as const, body: { message: 'Media included in dimension' } };
        })
      ),

    markStale: ({ body }: Req['markStale']) =>
      runHttp(() => ({
        status: 200 as const,
        body: {
          data: { staleness: comparisonsService.markStale(db, body.mediaType, body.mediaId) },
        },
      })),

    getStaleness: ({ query }: Req['getStaleness']) =>
      runHttp(() => ({
        status: 200 as const,
        body: {
          data: { staleness: comparisonsService.getStaleness(db, query.mediaType, query.mediaId) },
        },
      })),

    getTierListMovies: ({ params }: Req['getTierListMovies']) =>
      runHttp(() =>
        guard(() => ({
          status: 200 as const,
          body: { data: comparisonsService.getTierListMovies(db, params.dimensionId) },
        }))
      ),

    submitTierList: ({ body }: Req['submitTierList']) =>
      runHttp(() =>
        guard(() => ({
          status: 200 as const,
          body: {
            data: comparisonsService.submitTierList(db, body),
            message: 'Tier list submitted',
          },
        }))
      ),
  };
}
