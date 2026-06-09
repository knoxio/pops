/**
 * `food.recipes.*` tRPC router — PRD-119 part API.
 *
 * 11 procedures spanning the recipe CRUD surface. Each delegates to a
 * helper module in this directory; the router file stays declarative.
 *
 * | procedure          | helper file              |
 * | ------------------ | ------------------------ |
 * | list               | queries.ts               |
 * | getForRendering    | get-for-rendering.ts     |
 * | create             | create.ts                |
 * | createNewDraft     | create.ts                |
 * | saveDraft          | save.ts                  |
 * | promote            | save.ts                  |
 * | archiveVersion     | save.ts                  |
 * | archiveRecipe      | save.ts                  |
 * | listDrafts         | queries.ts               |
 * | restoreVersion     | create.ts                |
 * | listProposedSlugs  | queries.ts               |
 *
 * See `docs/themes/07-food/prds/119-recipe-crud-pages/README.md`.
 */
import { TRPCError } from '@trpc/server';

import { getDrizzle } from '../../../db.js';
import { protectedProcedure, router } from '../../../trpc.js';
import { createNewDraftForSlug, createNewRecipe, restoreVersionAsDraft } from './create.js';
import { getForRendering } from './get-for-rendering.js';
import {
  CreateInputSchema,
  CreateNewDraftInputSchema,
  GetForRenderingInputSchema,
  ListDraftsInputSchema,
  ListInputSchema,
  ListProposedSlugsInputSchema,
  RecipeSlugInputSchema,
  RestoreVersionInputSchema,
  SaveDraftInputSchema,
  VersionIdInputSchema,
} from './inputs.js';
import { decodeCursor, listDraftsForSlug, listProposedSlugs, listRecipes } from './queries.js';
import { archiveRecipeBySlug, archiveVersionRow, promote, saveDraft } from './save.js';

const DEFAULT_LIMIT = 20;

export const recipesRouter = router({
  list: protectedProcedure.input(ListInputSchema).query(({ input }) => {
    return listRecipes(getDrizzle(), {
      search: input.search,
      recipeTypes: input.recipeTypes,
      tags: input.tags,
      includeArchived: input.includeArchived ?? false,
      includeDraftOnly: input.includeDraftOnly ?? false,
      sort: input.sort ?? 'createdAtDesc',
      cursor: input.cursor === undefined ? null : decodeCursor(input.cursor),
      limit: input.limit ?? DEFAULT_LIMIT,
    });
  }),

  getForRendering: protectedProcedure.input(GetForRenderingInputSchema).query(({ input }) => {
    return getForRendering(getDrizzle(), input.slug, input.versionNo);
  }),

  create: protectedProcedure.input(CreateInputSchema).mutation(({ input }) => {
    return createNewRecipe(getDrizzle(), input.dsl);
  }),

  createNewDraft: protectedProcedure.input(CreateNewDraftInputSchema).mutation(({ input }) => {
    return createNewDraftForSlug(getDrizzle(), input.slug);
  }),

  saveDraft: protectedProcedure.input(SaveDraftInputSchema).mutation(({ input }) => {
    return saveDraft(getDrizzle(), input.versionId, input.dsl);
  }),

  promote: protectedProcedure.input(VersionIdInputSchema).mutation(({ input }) => {
    const result = promote(getDrizzle(), input.versionId);
    return result;
  }),

  archiveVersion: protectedProcedure.input(VersionIdInputSchema).mutation(({ input }) => {
    return archiveVersionRow(getDrizzle(), input.versionId);
  }),

  archiveRecipe: protectedProcedure.input(RecipeSlugInputSchema).mutation(({ input }) => {
    return archiveRecipeBySlug(getDrizzle(), input.slug);
  }),

  listDrafts: protectedProcedure.input(ListDraftsInputSchema).query(({ input }) => {
    const drafts = listDraftsForSlug(getDrizzle(), input.slug);
    if (drafts === null) {
      throw new TRPCError({ code: 'NOT_FOUND', message: `Recipe "${input.slug}" not found` });
    }
    return { drafts };
  }),

  restoreVersion: protectedProcedure.input(RestoreVersionInputSchema).mutation(({ input }) => {
    return restoreVersionAsDraft(getDrizzle(), input.sourceVersionId);
  }),

  listProposedSlugs: protectedProcedure.input(ListProposedSlugsInputSchema).query(({ input }) => {
    return { items: listProposedSlugs(getDrizzle(), input.versionId) };
  }),
});

export type RecipesRouter = typeof recipesRouter;
