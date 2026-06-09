import { z } from 'zod';

/**
 * Food → aliases tRPC procedures (PRD-122).
 *
 * Aliases point at exactly one of (ingredient_id, variant_id) per PRD-106's
 * XOR CHECK. The merge mutation rewires multiple aliases to a single
 * canonical target inside a transaction; bulk-approve flips llm-sourced
 * rows to user-sourced for the "trust this LLM proposal" affordance.
 */
import { aliasesService } from '@pops/app-food-db';

import { getDrizzle } from '../../../db.js';
import { protectedProcedure, router } from '../../../trpc.js';

const SOURCE_ENUM = z.enum(['user', 'llm', 'ingest']);

const TARGET_SCHEMA = z.object({
  kind: z.enum(['ingredient', 'variant']),
  id: z.number(),
});

export const aliasesRouter = router({
  list: protectedProcedure
    .input(
      z
        .object({
          search: z.string().optional(),
          source: SOURCE_ENUM.optional(),
          target: TARGET_SCHEMA.optional(),
        })
        .optional()
    )
    .query(({ input }) => ({ items: aliasesService.listAliases(getDrizzle(), input ?? {}) })),

  create: protectedProcedure
    .input(
      z.object({
        alias: z.string().min(1),
        target: TARGET_SCHEMA,
        source: SOURCE_ENUM.optional(),
      })
    )
    .mutation(({ input }) => aliasesService.createAlias(getDrizzle(), input)),

  updateText: protectedProcedure
    .input(z.object({ id: z.number(), alias: z.string().min(1) }))
    .mutation(({ input }) => aliasesService.updateAliasText(getDrizzle(), input.id, input.alias)),

  delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => {
    aliasesService.deleteAlias(getDrizzle(), input.id);
    return { ok: true as const };
  }),

  merge: protectedProcedure
    .input(z.object({ aliasIds: z.array(z.number()).min(1), target: TARGET_SCHEMA }))
    .mutation(({ input }) =>
      aliasesService.mergeAliases(getDrizzle(), {
        aliasIds: input.aliasIds,
        target: input.target,
      })
    ),

  bulkApprove: protectedProcedure
    .input(z.object({ aliasIds: z.array(z.number()).min(1) }))
    .mutation(({ input }) => aliasesService.bulkApproveAliases(getDrizzle(), input.aliasIds)),
});
