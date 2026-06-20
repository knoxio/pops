/**
 * Handlers for the `ingredientTags.*` sub-router. All read-only paths
 * delegate straight to the service; `set` returns the service's structured
 * `TagOpResult` (validation failures are data, not HTTP errors).
 */
import { ingredientTagsService } from '../../db/index.js';
import { runHttp } from './error-mapping.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { foodIngredientTagsContract } from '../../contract/rest-ingredient-tags.js';
import type { FoodDb } from '../../db/index.js';

type Req = ServerInferRequest<typeof foodIngredientTagsContract>;

export function makeIngredientTagsHandlers(db: FoodDb) {
  return {
    list: ({ query }: Req['list']) =>
      runHttp(() => ({
        status: 200 as const,
        body: ingredientTagsService.listTagsForIngredient(db, query.ingredientId),
      })),

    distinct: ({ query }: Req['distinct']) =>
      runHttp(() => ({
        status: 200 as const,
        body: ingredientTagsService.listDistinctTags(db, {
          namespacePrefix: query.namespacePrefix ?? null,
          limit: query.limit,
        }),
      })),

    byTag: ({ query }: Req['byTag']) =>
      runHttp(() => ({
        status: 200 as const,
        body: ingredientTagsService.listIngredientsByTag(db, query.tag),
      })),

    set: ({ params, body }: Req['set']) =>
      runHttp(() => ({
        status: 200 as const,
        body: ingredientTagsService.setTagsForIngredient(db, params.ingredientId, body.tags),
      })),
  };
}
