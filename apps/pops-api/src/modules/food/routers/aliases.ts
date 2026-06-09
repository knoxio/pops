import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { aliasesService } from '@pops/app-food-db';

import { getDrizzle } from '../../../db.js';
import { protectedProcedure, router } from '../../../trpc.js';

/**
 * The aliases service relies on the DB's partial UNIQUE indexes for dedupe —
 * duplicate `(alias, target)` inserts surface as raw SQLite UNIQUE errors,
 * mapped to CONFLICT here so clients get a stable code instead of a 500.
 */

const SOURCE_ENUM = z.enum(['user', 'llm', 'ingest']);

const TARGET_SCHEMA = z.object({
  kind: z.enum(['ingredient', 'variant']),
  id: z.number(),
});

function isSqliteUniqueError(err: unknown): boolean {
  return (
    err !== null &&
    typeof err === 'object' &&
    'code' in err &&
    typeof (err as { code: unknown }).code === 'string' &&
    (err as { code: string }).code === 'SQLITE_CONSTRAINT_UNIQUE'
  );
}

function mapAliasError(err: unknown): never {
  if (isSqliteUniqueError(err)) {
    throw new TRPCError({
      code: 'CONFLICT',
      message: 'An alias with this text already exists for the target',
      cause: err,
    });
  }
  throw err as Error;
}

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

  /**
   * PRD-122-C — denormalised list used by the aliases tab. Each row is
   * paired with the target's slug + name so the table can render without
   * an N+1 client-side lookup. Same filter contract as `list`.
   */
  listWithTargets: protectedProcedure
    .input(
      z
        .object({
          search: z.string().optional(),
          source: SOURCE_ENUM.optional(),
          target: TARGET_SCHEMA.optional(),
        })
        .optional()
    )
    .query(({ input }) => ({
      items: aliasesService.listAliasesWithTargets(getDrizzle(), input ?? {}),
    })),

  create: protectedProcedure
    .input(
      z.object({
        alias: z.string().min(1),
        target: TARGET_SCHEMA,
        source: SOURCE_ENUM.optional(),
      })
    )
    .mutation(({ input }) => {
      try {
        return aliasesService.createAlias(getDrizzle(), input);
      } catch (err) {
        mapAliasError(err);
      }
    }),

  updateText: protectedProcedure
    .input(z.object({ id: z.number(), alias: z.string().min(1) }))
    .mutation(({ input }) => {
      try {
        return aliasesService.updateAliasText(getDrizzle(), input.id, input.alias);
      } catch (err) {
        mapAliasError(err);
      }
    }),

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
