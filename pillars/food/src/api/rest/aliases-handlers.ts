/**
 * Handlers for the `aliases.*` sub-router.
 *
 * Error convention (ported from the pops-api aliases router): SQLite UNIQUE
 * on create/rename (an alias already exists for that target) → 409. The
 * list filters accept a `(targetKind, targetId)` pair which is folded back
 * into the service's `{ kind, id }` target shape.
 */
import { aliasesService } from '../../db/index.js';
import { ConflictError } from '../shared/errors.js';
import { isUniqueConstraintError } from '../shared/sqlite-errors.js';
import { runHttp } from './error-mapping.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { foodAliasesContract } from '../../contract/rest-aliases.js';
import type { FoodDb } from '../../db/index.js';
import type { AliasSource, AliasTarget } from '../../db/services/aliases.js';

type Req = ServerInferRequest<typeof foodAliasesContract>;

interface ListQuery {
  search?: string;
  source?: AliasSource;
  targetKind?: 'ingredient' | 'variant';
  targetId?: number;
}

function toListInput(query: ListQuery): {
  search?: string;
  source?: AliasSource;
  target?: AliasTarget;
} {
  const target =
    query.targetKind !== undefined && query.targetId !== undefined
      ? { kind: query.targetKind, id: query.targetId }
      : undefined;
  return { search: query.search, source: query.source, target };
}

function runUniqueAsConflict<T>(message: string, fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    if (isUniqueConstraintError(err)) throw new ConflictError(message);
    throw err;
  }
}

export function makeAliasesHandlers(db: FoodDb) {
  return {
    list: ({ query }: Req['list']) =>
      runHttp(() => ({
        status: 200 as const,
        body: { items: aliasesService.listAliases(db, toListInput(query)) },
      })),

    listWithTargets: ({ query }: Req['listWithTargets']) =>
      runHttp(() => ({
        status: 200 as const,
        body: { items: aliasesService.listAliasesWithTargets(db, toListInput(query)) },
      })),

    create: ({ body }: Req['create']) =>
      runHttp(() => ({
        status: 201 as const,
        body: {
          data: runUniqueAsConflict('An alias with this text already exists for the target', () =>
            aliasesService.createAlias(db, {
              alias: body.alias,
              target: body.target,
              source: body.source,
            })
          ),
        },
      })),

    updateText: ({ params, body }: Req['updateText']) =>
      runHttp(() => ({
        status: 200 as const,
        body: {
          data: runUniqueAsConflict('An alias with this text already exists for the target', () =>
            aliasesService.updateAliasText(db, params.id, body.alias)
          ),
        },
      })),

    delete: ({ params }: Req['delete']) =>
      runHttp(() => {
        aliasesService.deleteAlias(db, params.id);
        return { status: 200 as const, body: { ok: true as const } };
      }),

    merge: ({ body }: Req['merge']) =>
      runHttp(() => ({
        status: 200 as const,
        body: aliasesService.mergeAliases(db, { aliasIds: body.aliasIds, target: body.target }),
      })),

    bulkApprove: ({ body }: Req['bulkApprove']) =>
      runHttp(() => ({
        status: 200 as const,
        body: aliasesService.bulkApproveAliases(db, body.aliasIds),
      })),
  };
}
