/**
 * Handlers for the `variants.*` sub-router.
 *
 * Error mapping: `InvalidSlugError` → 400; SQLite UNIQUE (per-ingredient slug
 * collision) → 409; SQLite FK (variant referenced by a batch / recipe line /
 * alias / substitution) → 409; `expectRow` miss on update of an unknown id →
 * 404; delete of an unknown id → 404.
 */
import { InvalidSlugError, variantsService } from '../../db/index.js';
import { ConflictError, HttpError, NotFoundError } from '../shared/errors.js';
import { isForeignKeyConstraintError, isUniqueConstraintError } from '../shared/sqlite-errors.js';
import { runHttp } from './error-mapping.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { foodVariantsContract } from '../../contract/rest-variants.js';
import type { FoodDb } from '../../db/index.js';

type Req = ServerInferRequest<typeof foodVariantsContract>;

function isExpectRowMiss(err: unknown): boolean {
  return err instanceof Error && /expected a row but got none/i.test(err.message);
}

function translateWriteError(err: unknown): never {
  if (err instanceof InvalidSlugError) {
    throw new HttpError(400, err.message, undefined, 'common.validationFailed');
  }
  if (isUniqueConstraintError(err)) {
    throw new ConflictError('A variant with this slug already exists under the parent ingredient');
  }
  if (isForeignKeyConstraintError(err)) {
    throw new ConflictError(
      'Variant is referenced by another row (batch, recipe line, alias, or substitution)'
    );
  }
  throw err;
}

export function makeVariantsHandlers(db: FoodDb) {
  return {
    create: ({ body }: Req['create']) =>
      runHttp(() => {
        try {
          return {
            status: 201 as const,
            body: {
              data: variantsService.createVariant(db, {
                ingredientId: body.ingredientId,
                slug: body.slug,
                name: body.name,
                defaultUnit: body.defaultUnit,
                packageSizeG: body.packageSizeG,
                notes: body.notes,
                defaultShelfLifeDaysFridge: body.defaultShelfLifeDaysFridge,
                defaultShelfLifeDaysFreezer: body.defaultShelfLifeDaysFreezer,
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
            body: { data: variantsService.updateVariant(db, params.id, body) },
          };
        } catch (err) {
          if (isExpectRowMiss(err)) throw new NotFoundError('Variant', String(params.id));
          translateWriteError(err);
        }
      }),

    delete: ({ params }: Req['delete']) =>
      runHttp(() => {
        if (variantsService.getVariant(db, params.id) === null) {
          throw new NotFoundError('Variant', String(params.id));
        }
        try {
          variantsService.deleteVariant(db, params.id);
          return { status: 200 as const, body: { ok: true as const } };
        } catch (err) {
          if (isForeignKeyConstraintError(err)) {
            throw new ConflictError(
              'Variant is referenced by another row (batch, recipe line, alias, or substitution)'
            );
          }
          throw err;
        }
      }),
  };
}
