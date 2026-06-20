/**
 * Handlers for the `slugs.*` sub-router. Read-only; delegates straight to
 * `slugSearchService.searchSlugs` over the in-pillar slug registry.
 */
import { slugSearchService } from '../../db/index.js';
import { runHttp } from './error-mapping.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { foodSlugsContract } from '../../contract/rest-slugs.js';
import type { FoodDb } from '../../db/index.js';

type Req = ServerInferRequest<typeof foodSlugsContract>;

export function makeSlugsHandlers(db: FoodDb) {
  return {
    search: ({ query }: Req['search']) =>
      runHttp(() => ({
        status: 200 as const,
        body: {
          items: slugSearchService.searchSlugs(db, {
            query: query.query,
            kinds: query.kinds,
            limit: query.limit,
          }),
        },
      })),
  };
}
