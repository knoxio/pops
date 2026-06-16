/**
 * Handlers for the `recipes.*` sub-router. Delegate to the lifted helper
 * modules (queries / create / save / get-for-rendering) over the in-pillar
 * db + dsl compile pipeline. Errors are translated to HttpError in the
 * helpers / error-mapping; `runHttp` maps them to status envelopes.
 */
import {
  createNewDraftForSlug,
  createNewRecipe,
  restoreVersionAsDraft,
} from '../modules/recipes/create.js';
import { getForRendering } from '../modules/recipes/get-for-rendering.js';
import {
  decodeCursor,
  listDraftsForSlug,
  listProposedSlugs,
  listRecipes,
} from '../modules/recipes/queries.js';
import {
  archiveRecipeBySlug,
  archiveVersionRow,
  promote,
  saveDraft,
} from '../modules/recipes/save.js';
import { NotFoundError } from '../shared/errors.js';
import { runHttp } from './error-mapping.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { foodRecipesContract } from '../../contract/rest-recipes.js';
import type { FoodDb } from '../../db/index.js';

type Req = ServerInferRequest<typeof foodRecipesContract>;

const DEFAULT_LIMIT = 20;

export function makeRecipesHandlers(db: FoodDb) {
  return {
    list: ({ body }: Req['list']) =>
      runHttp(() => ({
        status: 200 as const,
        body: listRecipes(db, {
          search: body.search,
          recipeTypes: body.recipeTypes,
          tags: body.tags,
          includeArchived: body.includeArchived ?? false,
          includeDraftOnly: body.includeDraftOnly ?? false,
          sort: body.sort ?? 'createdAtDesc',
          cursor: body.cursor === undefined ? null : decodeCursor(body.cursor),
          limit: body.limit ?? DEFAULT_LIMIT,
        }),
      })),

    create: ({ body }: Req['create']) =>
      runHttp(() => ({ status: 201 as const, body: createNewRecipe(db, body.dsl) })),

    getForRendering: ({ params, query }: Req['getForRendering']) =>
      runHttp(() => ({
        status: 200 as const,
        body: getForRendering(db, params.slug, query.versionNo),
      })),

    listDrafts: ({ params }: Req['listDrafts']) =>
      runHttp(() => {
        const drafts = listDraftsForSlug(db, params.slug);
        if (drafts === null) throw new NotFoundError('Recipe', params.slug);
        return { status: 200 as const, body: { drafts } };
      }),

    createNewDraft: ({ params }: Req['createNewDraft']) =>
      runHttp(() => ({ status: 201 as const, body: createNewDraftForSlug(db, params.slug) })),

    archiveRecipe: ({ params }: Req['archiveRecipe']) =>
      runHttp(() => ({ status: 200 as const, body: archiveRecipeBySlug(db, params.slug) })),

    saveDraft: ({ params, body }: Req['saveDraft']) =>
      runHttp(() => ({ status: 200 as const, body: saveDraft(db, params.versionId, body.dsl) })),

    promote: ({ params }: Req['promote']) =>
      runHttp(() => ({ status: 200 as const, body: promote(db, params.versionId) })),

    archiveVersion: ({ params }: Req['archiveVersion']) =>
      runHttp(() => ({ status: 200 as const, body: archiveVersionRow(db, params.versionId) })),

    restoreVersion: ({ params }: Req['restoreVersion']) =>
      runHttp(() => ({ status: 201 as const, body: restoreVersionAsDraft(db, params.versionId) })),

    listProposedSlugs: ({ params }: Req['listProposedSlugs']) =>
      runHttp(() => ({
        status: 200 as const,
        body: { items: listProposedSlugs(db, params.versionId) },
      })),
  };
}
