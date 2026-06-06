import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { NotFoundError } from '../../../shared/errors.js';
import { paginationMeta } from '../../../shared/pagination.js';
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
   * Return all rules folded with pending ChangeSets. Used by the import
   * wizard's browse-mode rule manager so the client never has to fold
   * pending ops against a paginated rule list — folding paginated rules
   * client-side throws when an op targets a row outside the page window.
   */
  listMerged: protectedProcedure
    .input(
      z.object({
        pendingChangeSets: z
          .array(z.object({ changeSet: ChangeSetSchema }))
          .max(200)
          .optional(),
      })
    )
    .query(({ input }) => {
      try {
        const dbRules = service.listCorrections(undefined, PREVIEW_RULES_FETCH_LIMIT, 0).rows;
        const merged =
          input.pendingChangeSets && input.pendingChangeSets.length > 0
            ? input.pendingChangeSets.reduce(
                (acc, pcs) => service.applyChangeSetToRules(acc, pcs.changeSet),
                dbRules
              )
            : dbRules;
        return { data: merged.map(toCorrection) };
      } catch (err) {
        if (err instanceof NotFoundError) {
          throw new TRPCError({ code: 'NOT_FOUND', message: err.message });
        }
        throw err;
      }
    }),

  get: protectedProcedure.input(z.object({ id: z.string() })).query(({ input }) => {
    try {
      const row = service.getCorrection(input.id);
      return { data: toCorrection(row) };
    } catch (err) {
      if (err instanceof NotFoundError) {
        throw new TRPCError({ code: 'NOT_FOUND', message: err.message });
      }
      throw err;
    }
  }),

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
    .mutation(({ input }) => {
      try {
        const row = service.updateCorrection(input.id, input.data);
        return { data: toCorrection(row), message: 'Correction updated' };
      } catch (err) {
        if (err instanceof NotFoundError) {
          throw new TRPCError({ code: 'NOT_FOUND', message: err.message });
        }
        throw err;
      }
    }),

  delete: protectedProcedure.input(z.object({ id: z.string() })).mutation(({ input }) => {
    try {
      service.deleteCorrection(input.id);
      return { message: 'Correction deleted' };
    } catch (err) {
      if (err instanceof NotFoundError) {
        throw new TRPCError({ code: 'NOT_FOUND', message: err.message });
      }
      throw err;
    }
  }),

  adjustConfidence: protectedProcedure
    .input(z.object({ id: z.string(), delta: z.number().min(-1).max(1) }))
    .mutation(({ input }) => {
      try {
        service.adjustConfidence(input.id, input.delta);
        return { message: 'Confidence adjusted' };
      } catch (err) {
        if (err instanceof NotFoundError) {
          throw new TRPCError({ code: 'NOT_FOUND', message: err.message });
        }
        throw err;
      }
    }),

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
