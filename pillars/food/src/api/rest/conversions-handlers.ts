/**
 * Handlers for the `conversions.*` sub-router.
 *
 * SQLite UNIQUE failures on create map to 409 ConflictError; `expectRow`
 * "no row" misses on update map to 404 NotFoundError; `SeededRowProtected`
 * on delete maps to the `{ ok: false, reason: 'seeded' }` body (200).
 * Unknown delete ids are a silent idempotent `{ ok: true }`.
 */
import { conversionsQueries, conversionsService, SeededRowProtected } from '../../db/index.js';
import { toIngredientWeight, toUnitConversion } from '../modules/conversions/types.js';
import { ConflictError, NotFoundError } from '../shared/errors.js';
import { isUniqueConstraintError } from '../shared/sqlite-errors.js';
import { runHttp } from './error-mapping.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { foodConversionsContract } from '../../contract/rest-conversions.js';
import type { FoodDb } from '../../db/index.js';

type Req = ServerInferRequest<typeof foodConversionsContract>;

/** `conversionsService.update*` throws "<label>: expected a row but got none". */
function isExpectRowMiss(err: unknown): boolean {
  return err instanceof Error && /expected a row but got none/i.test(err.message);
}

function runCreate<T>(label: string, fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    if (isUniqueConstraintError(err)) throw new ConflictError(`${label}: row already exists`);
    throw err;
  }
}

function runUpdate<T>(resource: string, id: number, fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    if (isExpectRowMiss(err)) throw new NotFoundError(resource, String(id));
    throw err;
  }
}

function runDelete(fn: () => void): { ok: true } | { ok: false; reason: 'seeded' } {
  try {
    fn();
    return { ok: true };
  } catch (err) {
    if (err instanceof SeededRowProtected) return { ok: false, reason: 'seeded' };
    throw err;
  }
}

export function makeConversionsHandlers(db: FoodDb) {
  return {
    listUnits: ({ query }: Req['listUnits']) =>
      runHttp(() => ({
        status: 200 as const,
        body: {
          items: conversionsQueries
            .listUnitConversions(db, { search: query.search, seededOnly: query.seededOnly })
            .map(toUnitConversion),
        },
      })),

    createUnit: ({ body }: Req['createUnit']) =>
      runHttp(() => ({
        status: 201 as const,
        body: {
          data: toUnitConversion(
            runCreate('unit_conversion', () => conversionsService.createUnitConversion(db, body))
          ),
        },
      })),

    updateUnit: ({ params, body }: Req['updateUnit']) =>
      runHttp(() => ({
        status: 200 as const,
        body: {
          data: toUnitConversion(
            runUpdate('unit_conversion', params.id, () =>
              conversionsService.updateUnitConversion(db, params.id, body)
            )
          ),
        },
      })),

    deleteUnit: ({ params }: Req['deleteUnit']) =>
      runHttp(() => ({
        status: 200 as const,
        body: runDelete(() => conversionsService.deleteUnitConversion(db, params.id)),
      })),

    listWeights: ({ query }: Req['listWeights']) =>
      runHttp(() => ({
        status: 200 as const,
        body: {
          items: conversionsQueries
            .listIngredientWeights(db, {
              ingredientId: query.ingredientId,
              search: query.search,
              seededOnly: query.seededOnly,
            })
            .map(toIngredientWeight),
        },
      })),

    createWeight: ({ body }: Req['createWeight']) =>
      runHttp(() => ({
        status: 201 as const,
        body: {
          data: toIngredientWeight(
            runCreate('ingredient_weight', () =>
              conversionsService.createIngredientWeight(db, {
                ingredientId: body.ingredientId,
                variantId: body.variantId ?? null,
                unit: body.unit,
                grams: body.grams,
                notes: body.notes,
              })
            )
          ),
        },
      })),

    updateWeight: ({ params, body }: Req['updateWeight']) =>
      runHttp(() => ({
        status: 200 as const,
        body: {
          data: toIngredientWeight(
            runUpdate('ingredient_weight', params.id, () =>
              conversionsService.updateIngredientWeight(db, params.id, body)
            )
          ),
        },
      })),

    deleteWeight: ({ params }: Req['deleteWeight']) =>
      runHttp(() => ({
        status: 200 as const,
        body: runDelete(() => conversionsService.deleteIngredientWeight(db, params.id)),
      })),

    resolve: ({ query }: Req['resolve']) =>
      runHttp(() => ({
        status: 200 as const,
        body: conversionsService.resolveCanonicalQty(db, {
          ingredientId: query.ingredientId,
          variantId: query.variantId ?? null,
          unit: query.unit,
          qty: query.qty,
        }),
      })),
  };
}
