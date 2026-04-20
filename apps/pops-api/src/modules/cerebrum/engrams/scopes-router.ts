/**
 * tRPC router for cerebrum.scopes.
 *
 * Procedures: assign, remove, reclassify, list, validate, filter.
 * All file writes use temp-and-rename for atomicity. reclassify additionally
 * rolls back all file writes if any single engram fails.
 */
import { TRPCError } from '@trpc/server';
import { count, eq, like, or } from 'drizzle-orm';
import { z } from 'zod';

import { engramScopes } from '@pops/db-types';

import { getDrizzle } from '../../../db.js';
import { HttpError, NotFoundError, ValidationError } from '../../../shared/errors.js';
import { protectedProcedure, router } from '../../../trpc.js';
import { getEngramRoot, getEngramService } from '../instance.js';
import { reclassifyScopes } from './reclassify.js';
import { filterByScopes } from './scope-filter.js';
import { normaliseScope, scopeStringSchema, validateScope } from './scope-schema.js';

import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

const engramIdSchema = z.string().regex(/^eng_\d{8}_\d{4}_[a-z0-9-]+$/);
const scopeInputSchema = scopeStringSchema;
const scopesArraySchema = z.array(scopeInputSchema).min(1);

const SCOPE_PREFIX_SEGMENT = /^[a-z0-9][a-z0-9-]{0,31}$/;
const scopePrefixSchema = z
  .string()
  .transform((val) => normaliseScope(val))
  .superRefine((val, ctx) => {
    if (val.length === 0 || val.startsWith('.') || val.endsWith('.') || val.includes('..')) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'invalid scope prefix format' });
      return;
    }
    const segs = val.split('.');
    if (segs.length > 6) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'scope prefix must have at most 6 segments',
      });
    }
    for (const seg of segs) {
      if (!SCOPE_PREFIX_SEGMENT.test(seg)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `segment '${seg}' is invalid — must be lowercase alphanumeric/hyphens, 1-32 chars`,
        });
      }
    }
  });

export interface ScopeInfo {
  scope: string;
  count: number;
}

/**
 * List all distinct scopes with engram counts. If `prefix` is provided,
 * only scopes that are equal to or children of the prefix are returned.
 */
export function listScopes(db: BetterSQLite3Database, prefix?: string): ScopeInfo[] {
  const norm = prefix !== undefined && prefix.trim() !== '' ? normaliseScope(prefix) : undefined;
  const q = db.select({ scope: engramScopes.scope, total: count() }).from(engramScopes).$dynamic();
  const rows = (
    norm ? q.where(or(eq(engramScopes.scope, norm), like(engramScopes.scope, `${norm}.%`))) : q
  )
    .groupBy(engramScopes.scope)
    .all();
  return rows.map((r) => ({ scope: r.scope, count: r.total }));
}

function extractValidationMessage(err: ValidationError): string {
  const details = err.details;
  if (typeof details === 'string') return details;
  if (
    typeof details === 'object' &&
    details !== null &&
    typeof (details as { message?: unknown }).message === 'string'
  ) {
    return (details as { message: string }).message;
  }
  return err.message;
}

function toTrpcError(err: unknown): never {
  if (err instanceof NotFoundError) {
    throw new TRPCError({ code: 'NOT_FOUND', message: err.message });
  }
  if (err instanceof ValidationError) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: extractValidationMessage(err),
      cause: err,
    });
  }
  if (err instanceof HttpError) {
    throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: err.message });
  }
  throw err;
}

const reclassifyInput = z.object({
  fromScope: scopePrefixSchema,
  toScope: scopePrefixSchema,
  dryRun: z.boolean().optional(),
});

const filterInput = z.object({
  scopes: z.array(scopePrefixSchema),
  includeSecret: z.boolean().optional(),
});

export const scopesRouter = router({
  /**
   * Add scopes to an engram. Validates each scope, updates the file and index.
   */
  assign: protectedProcedure
    .input(z.object({ engramId: engramIdSchema, scopes: scopesArraySchema }))
    .mutation(({ input }) => {
      try {
        const svc = getEngramService();
        const { engram } = svc.read(input.engramId);
        const merged = [...new Set([...engram.scopes, ...input.scopes])];
        return { engram: svc.update(input.engramId, { scopes: merged }) };
      } catch (err) {
        toTrpcError(err);
      }
    }),

  /**
   * Remove scopes from an engram. Rejects if it would leave zero scopes.
   */
  remove: protectedProcedure
    .input(z.object({ engramId: engramIdSchema, scopes: scopesArraySchema }))
    .mutation(({ input }) => {
      try {
        const svc = getEngramService();
        const { engram } = svc.read(input.engramId);
        const toRemove = new Set(input.scopes);
        const remaining = engram.scopes.filter((s) => !toRemove.has(s));
        if (remaining.length === 0) {
          throw new ValidationError({
            message: 'cannot remove the last scope — an engram must have at least one scope',
          });
        }
        return { engram: svc.update(input.engramId, { scopes: remaining }) };
      } catch (err) {
        toTrpcError(err);
      }
    }),

  /**
   * Bulk rename: replace `fromScope` prefix across all matching engrams.
   * Atomic — rolls back all file writes if any single write fails.
   * When `dryRun` is true, returns the count and IDs without modifying anything.
   */
  reclassify: protectedProcedure.input(reclassifyInput).mutation(({ input }) => {
    try {
      return reclassifyScopes(getDrizzle(), getEngramRoot(), input);
    } catch (err) {
      toTrpcError(err);
    }
  }),

  /**
   * List all known scopes with engram counts, optionally filtered by prefix.
   */
  list: protectedProcedure
    .input(z.object({ prefix: scopePrefixSchema.optional() }).optional())
    .query(({ input }) => {
      return { scopes: listScopes(getDrizzle(), input?.prefix) };
    }),

  /**
   * Validate a scope string. Returns structured error messages on failure.
   */
  validate: protectedProcedure.input(z.object({ scope: z.string() })).query(({ input }) => {
    const result = validateScope(input.scope);
    if (result.valid) return { valid: true as const, scope: result.scope };
    return { valid: false as const, errors: result.errors };
  }),

  /**
   * Return engrams matching scope prefixes with optional secret opt-in.
   */
  filter: protectedProcedure.input(filterInput).query(({ input }) => {
    try {
      const { engramIds } = filterByScopes({
        scopes: input.scopes,
        includeSecret: input.includeSecret,
        db: getDrizzle(),
      });
      if (engramIds.length === 0) return { engrams: [] };
      const { engrams } = getEngramService().list({ ids: engramIds });
      return { engrams };
    } catch (err) {
      toTrpcError(err);
    }
  }),
});
