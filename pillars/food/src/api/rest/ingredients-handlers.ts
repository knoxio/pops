/**
 * Handlers for the `ingredients.*` sub-router.
 *
 * Error convention (ported from the pops-api ingredients router):
 * `InvalidSlugError` / `IngredientCycleError` / `IngredientHierarchyDepthExceeded`
 * → 400; `SlugAlreadyRegisteredError` → 409; SQLite FK (ingredient in use)
 * → 409; `expectRow` miss on update / change-parent of an unknown id → 404.
 * Delete is soft-blocked: when variants or aliases remain it answers
 * `{ ok:false, blockers }` rather than deleting.
 */
import {
  IngredientCycleError,
  IngredientHierarchyDepthExceeded,
  ingredientsQueries,
  ingredientsService,
  InvalidSlugError,
  SlugAlreadyRegisteredError,
} from '../../db/index.js';
import { ConflictError, HttpError, NotFoundError } from '../shared/errors.js';
import { isForeignKeyConstraintError } from '../shared/sqlite-errors.js';
import { runHttp } from './error-mapping.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { foodIngredientsContract } from '../../contract/rest-ingredients.js';
import type { FoodDb } from '../../db/index.js';

type Req = ServerInferRequest<typeof foodIngredientsContract>;

function isExpectRowMiss(err: unknown): boolean {
  return err instanceof Error && /expected a row but got none/i.test(err.message);
}

function badRequest(message: string): HttpError {
  return new HttpError(400, message, undefined, 'common.validationFailed');
}

function translateWriteError(err: unknown): never {
  if (err instanceof InvalidSlugError) throw badRequest(err.message);
  if (err instanceof IngredientCycleError) throw badRequest(err.message);
  if (err instanceof IngredientHierarchyDepthExceeded) throw badRequest(err.message);
  if (err instanceof SlugAlreadyRegisteredError) throw new ConflictError(err.message);
  if (isForeignKeyConstraintError(err)) throw new ConflictError('Ingredient is in use');
  throw err;
}

export function makeIngredientsHandlers(db: FoodDb) {
  return {
    list: ({ query }: Req['list']) =>
      runHttp(() => ({
        status: 200 as const,
        body: {
          items: ingredientsQueries.listIngredients(db, {
            search: query.search,
            parentId: query.parentId,
          }),
        },
      })),

    get: ({ params }: Req['get']) =>
      runHttp(() => {
        const ingredient = /^\d+$/.test(params.idOrSlug)
          ? ingredientsQueries.getIngredient(db, Number(params.idOrSlug))
          : ingredientsQueries.getIngredientBySlug(db, params.idOrSlug);
        if (ingredient === null) throw new NotFoundError('Ingredient', params.idOrSlug);
        return {
          status: 200 as const,
          body: {
            ingredient,
            variants: ingredientsQueries.listVariantsForIngredient(db, ingredient.id),
          },
        };
      }),

    create: ({ body }: Req['create']) =>
      runHttp(() => {
        try {
          return {
            status: 201 as const,
            body: {
              data: ingredientsService.createIngredient(db, {
                slug: body.slug,
                name: body.name,
                defaultUnit: body.defaultUnit,
                parentId: body.parentId,
                densityGPerMl: body.densityGPerMl,
                notes: body.notes,
              }),
            },
          };
        } catch (err) {
          translateWriteError(err);
        }
      }),

    update: ({ params, body }: Req['update']) =>
      runHttp(() => {
        try {
          return {
            status: 200 as const,
            body: { data: ingredientsService.updateIngredient(db, params.id, body) },
          };
        } catch (err) {
          if (isExpectRowMiss(err)) throw new NotFoundError('Ingredient', String(params.id));
          translateWriteError(err);
        }
      }),

    rename: ({ body }: Req['rename']) =>
      runHttp(() => {
        try {
          return {
            status: 200 as const,
            body: { data: ingredientsService.renameIngredientSlug(db, body.oldSlug, body.newSlug) },
          };
        } catch (err) {
          if (err instanceof Error && /not found/i.test(err.message) && !isExpectRowMiss(err)) {
            throw new NotFoundError('Ingredient', body.oldSlug);
          }
          translateWriteError(err);
        }
      }),

    changeParent: ({ params, body }: Req['changeParent']) =>
      runHttp(() => {
        try {
          return {
            status: 200 as const,
            body: {
              data: ingredientsService.changeIngredientParent(db, params.id, body.newParentId),
            },
          };
        } catch (err) {
          if (isExpectRowMiss(err)) throw new NotFoundError('Ingredient', String(params.id));
          translateWriteError(err);
        }
      }),

    blockers: ({ params }: Req['blockers']) =>
      runHttp(() => ({
        status: 200 as const,
        body: { data: ingredientsQueries.getIngredientDeleteBlockers(db, params.id) },
      })),

    recipeRefs: ({ params }: Req['recipeRefs']) =>
      runHttp(() => ({
        status: 200 as const,
        body: ingredientsQueries.getRecipeRefsForIngredient(db, params.id),
      })),

    delete: ({ params }: Req['delete']) =>
      runHttp(() => {
        const blockers = ingredientsQueries.getIngredientDeleteBlockers(db, params.id);
        if (blockers.variants > 0 || blockers.aliases > 0) {
          return { status: 200 as const, body: { ok: false as const, blockers } };
        }
        try {
          ingredientsService.deleteIngredient(db, params.id);
          return { status: 200 as const, body: { ok: true as const } };
        } catch (err) {
          if (isForeignKeyConstraintError(err)) throw new ConflictError('Ingredient is in use');
          throw err;
        }
      }),
  };
}
