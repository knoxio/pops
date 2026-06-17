/**
 * Handlers for the `shelfImpressions.*` sub-router.
 *
 * Thin wrappers over `@pops/media` `shelfImpressionsService`.
 * `freshness` 404s when the shelf has no impressions in the window.
 */
import { type MediaDb, shelfImpressionsService } from '../../db/index.js';
import { NotFoundError } from '../shared/errors.js';
import { runHttp } from './error-mapping.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { mediaShelfImpressionsContract } from '../../contract/rest-shelf-impressions.js';

type Req = ServerInferRequest<typeof mediaShelfImpressionsContract>;

export function makeShelfImpressionsHandlers(db: MediaDb) {
  return {
    record: ({ body }: Req['record']) =>
      runHttp(() => {
        shelfImpressionsService.recordImpressions(db, body.shelfIds);
        return {
          status: 200 as const,
          body: { ok: true as const, recorded: body.shelfIds.length },
        };
      }),

    recent: ({ query }: Req['recent']) =>
      runHttp(() => {
        const counts = shelfImpressionsService.getRecentImpressions(db, query.days);
        return {
          status: 200 as const,
          body: {
            windowDays: query.days,
            entries: Array.from(counts, ([shelfId, impressionCount]) => ({
              shelfId,
              impressionCount,
            })),
          },
        };
      }),

    freshness: ({ query }: Req['freshness']) =>
      runHttp(() => {
        const counts = shelfImpressionsService.getRecentImpressions(db, query.days);
        const impressionCount = counts.get(query.shelfId);
        if (impressionCount === undefined) {
          throw new NotFoundError('Shelf impression', query.shelfId);
        }
        return {
          status: 200 as const,
          body: {
            shelfId: query.shelfId,
            impressionCount,
            freshness: shelfImpressionsService.getShelfFreshness(impressionCount),
          },
        };
      }),

    cleanup: () =>
      runHttp(() => {
        shelfImpressionsService.cleanupOldImpressions(db);
        return { status: 200 as const, body: { ok: true as const } };
      }),
  };
}
