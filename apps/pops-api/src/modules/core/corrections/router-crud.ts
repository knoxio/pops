import { z } from 'zod';

import { paginationMeta } from '../../../shared/pagination.js';
import { mapDomainErrors } from '../../../shared/trpc-error-mapper.js';
import { protectedProcedure, router } from '../../../trpc.js';
import { previewMatches } from './handlers/preview-matches.js';
import { analyzeCorrection, generateRules } from './lib/rule-generator.js';
import { PREVIEW_RULES_FETCH_LIMIT } from './router-changeset-schemas.js';
import * as service from './service.js';
import {
  ChangeSetSchema,
  CreateCorrectionSchema,
  FindCorrectionSchema,
  toCorrection,
  UpdateCorrectionSchema,
} from './types.js';

const DEFAULT_LIMIT = 50;
const DEFAULT_OFFSET = 0;

export const crudRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        minConfidence: z.number().min(0).max(1).optional(),
        matchType: z.enum(['exact', 'contains', 'regex']).optional(),
        limit: z.coerce.number().positive().optional(),
        offset: z.coerce.number().nonnegative().optional(),
      })
    )
    .query(({ input }) => {
      const limit = input.limit ?? DEFAULT_LIMIT;
      const offset = input.offset ?? DEFAULT_OFFSET;
      const { rows, total } = service.listCorrections(
        input.minConfidence,
        limit,
        offset,
        input.matchType
      );
      return {
        data: rows.map(toCorrection),
        pagination: paginationMeta(total, limit, offset),
      };
    }),

  /**
   * Return rules folded with pending ChangeSets. Loads up to
   * PREVIEW_RULES_FETCH_LIMIT DB rows, applies the pending ops, then
   * paginates the merged result. Merging the full set BEFORE slicing is
   * important — folding a paginated slice client-side throws when a pending
   * op targets a row outside the window.
   */
  listMerged: protectedProcedure
    .input(
      z.object({
        pendingChangeSets: z
          .array(z.object({ changeSet: ChangeSetSchema }))
          .max(200)
          .optional(),
        limit: z.coerce.number().positive().max(PREVIEW_RULES_FETCH_LIMIT).optional(),
        offset: z.coerce.number().nonnegative().optional(),
      })
    )
    .query(({ input }) =>
      mapDomainErrors(() => {
        const dbRules = service.listCorrections(undefined, PREVIEW_RULES_FETCH_LIMIT, 0).rows;
        const merged =
          input.pendingChangeSets && input.pendingChangeSets.length > 0
            ? input.pendingChangeSets.reduce(
                (acc, pcs) => service.applyChangeSetToRules(acc, pcs.changeSet),
                dbRules
              )
            : dbRules;
        const offset = input.offset ?? 0;
        const limit = input.limit;
        const sliced =
          limit === undefined ? merged.slice(offset) : merged.slice(offset, offset + limit);
        return {
          data: sliced.map(toCorrection),
          pagination: paginationMeta(merged.length, limit ?? merged.length, offset),
        };
      })
    ),

  get: protectedProcedure.input(z.object({ id: z.string() })).query(({ input }) =>
    mapDomainErrors(() => {
      const row = service.getCorrection(input.id);
      return { data: toCorrection(row) };
    })
  ),

  findMatch: protectedProcedure.input(FindCorrectionSchema).query(({ input }) => {
    const result = service.findMatchingCorrection(input.description, input.minConfidence);
    if (!result) return { data: null, status: null };
    return { data: toCorrection(result.correction), status: result.status };
  }),

  createOrUpdate: protectedProcedure.input(CreateCorrectionSchema).mutation(({ input }) => {
    const row = service.createOrUpdateCorrection(input);
    return { data: toCorrection(row), message: 'Correction saved' };
  }),

  update: protectedProcedure
    .input(z.object({ id: z.string(), data: UpdateCorrectionSchema }))
    .mutation(({ input }) =>
      mapDomainErrors(() => {
        const row = service.updateCorrection(input.id, input.data);
        return { data: toCorrection(row), message: 'Correction updated' };
      })
    ),

  delete: protectedProcedure.input(z.object({ id: z.string() })).mutation(({ input }) =>
    mapDomainErrors(() => {
      service.deleteCorrection(input.id);
      return { message: 'Correction deleted' };
    })
  ),

  adjustConfidence: protectedProcedure
    .input(z.object({ id: z.string(), delta: z.number().min(-1).max(1) }))
    .mutation(({ input }) =>
      mapDomainErrors(() => {
        service.adjustConfidence(input.id, input.delta);
        return { message: 'Confidence adjusted' };
      })
    ),

  analyzeCorrection: protectedProcedure
    .input(
      z.object({
        description: z.string().min(1),
        entityName: z.string().min(1),
        amount: z.number(),
      })
    )
    .mutation(async ({ input }) => {
      const result = await analyzeCorrection(input);
      return { data: result };
    }),

  /**
   * Preview which transactions a candidate (pattern, matchType) would match
   * against the live transactions table. Used by the manual rule create/edit
   * dialog (#2187) to show users which rows their rule will affect before
   * they save it.
   */
  previewMatches: protectedProcedure
    .input(
      z.object({
        descriptionPattern: z.string().min(1),
        matchType: z.enum(['exact', 'contains', 'regex']),
        limit: z.number().int().positive().max(200).optional(),
      })
    )
    .query(({ input }) => {
      const result = previewMatches(input);
      return { data: result };
    }),

  generateRules: protectedProcedure
    .input(
      z.object({
        transactions: z
          .array(
            z.object({
              description: z.string(),
              entityName: z.string().nullable(),
              amount: z.number(),
              account: z.string(),
              currentTags: z.array(z.string()),
            })
          )
          .min(1)
          .max(50),
      })
    )
    .mutation(async ({ input }) => {
      const proposals = await generateRules(input.transactions);
      return { proposals };
    }),
});
