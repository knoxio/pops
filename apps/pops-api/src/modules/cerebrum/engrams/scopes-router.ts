/**
 * tRPC router for cerebrum.scopes.
 *
 * Procedures: assign, remove, reclassify, list, validate, filter.
 * All file writes use temp-and-rename for atomicity. reclassify additionally
 * rolls back all file writes if any single engram fails.
 */
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { TRPCError } from '@trpc/server';
import { count, eq, inArray, like, or, sql } from 'drizzle-orm';
import { z } from 'zod';

import { engramIndex, engramScopes } from '@pops/db-types';

import { getDrizzle } from '../../../db.js';
import { HttpError, NotFoundError, ValidationError } from '../../../shared/errors.js';
import { protectedProcedure, router } from '../../../trpc.js';
import { getEngramRoot, getEngramService } from '../instance.js';
import { parseEngramFile, serializeEngram } from './file.js';
import { filterByScopes } from './scope-filter.js';
import { normaliseScope, scopeStringSchema, validateScope } from './scope-schema.js';

import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

const engramIdSchema = z.string().regex(/^eng_\d{8}_\d{4}_[a-z0-9-]+$/);
const scopeInputSchema = scopeStringSchema;
const scopesArraySchema = z.array(scopeInputSchema).min(1);

// Prefix schema: 1–6 segments (vs. full scopes which require 2–6). Used for
// filter.scopes and list.prefix where single-segment prefixes like "work" are valid.
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

// ---------------------------------------------------------------------------
// Service helpers (stateless, exported for testing)
// ---------------------------------------------------------------------------

export interface ScopeInfo {
  scope: string;
  count: number;
}

/**
 * List all distinct scopes with engram counts. If `prefix` is provided,
 * only scopes that are equal to or children of the prefix are returned.
 * The prefix filter is pushed into SQL so the DB can use the scope index.
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

/**
 * Find all engram IDs + their scopes that match the given fromScope prefix,
 * computing what new scope each old scope maps to.
 */
function findReclassifyTargets(
  db: BetterSQLite3Database,
  fromScope: string,
  toScope: string
): { engramId: string; oldScope: string; newScope: string }[] {
  const rows = db
    .select({ engramId: engramScopes.engramId, scope: engramScopes.scope })
    .from(engramScopes)
    .where(or(eq(engramScopes.scope, fromScope), like(engramScopes.scope, `${fromScope}.%`)))
    .all();

  return rows.map((r) => ({
    engramId: r.engramId,
    oldScope: r.scope,
    newScope: r.scope === fromScope ? toScope : `${toScope}${r.scope.slice(fromScope.length)}`,
  }));
}

/** Write content to an absolute path via a temp file (atomic). */
function writeFileAtomic(absPath: string, contents: string): void {
  mkdirSync(dirname(absPath), { recursive: true });
  const tmp = `${absPath}.tmp.${randomUUID()}`;
  writeFileSync(tmp, contents, 'utf8');
  renameSync(tmp, absPath);
}

// ---------------------------------------------------------------------------
// tRPC error converter
// ---------------------------------------------------------------------------

function toTrpcError(err: unknown): never {
  if (err instanceof NotFoundError) {
    throw new TRPCError({ code: 'NOT_FOUND', message: err.message });
  }
  if (err instanceof ValidationError) {
    const details = err.details;
    const message =
      typeof details === 'string'
        ? details
        : typeof details === 'object' &&
            details !== null &&
            typeof (details as { message?: unknown }).message === 'string'
          ? (details as { message: string }).message
          : err.message;
    throw new TRPCError({ code: 'BAD_REQUEST', message, cause: err });
  }
  if (err instanceof HttpError) {
    throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: err.message });
  }
  throw err;
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const scopesRouter = router({
  /**
   * Add scopes to an engram. Validates each scope, updates the file and index.
   */
  assign: protectedProcedure
    .input(
      z.object({
        engramId: engramIdSchema,
        scopes: scopesArraySchema,
      })
    )
    .mutation(({ input }) => {
      try {
        const svc = getEngramService();
        const { engram } = svc.read(input.engramId);
        const merged = [...new Set([...engram.scopes, ...input.scopes])];
        const updated = svc.update(input.engramId, { scopes: merged });
        return { engram: updated };
      } catch (err) {
        toTrpcError(err);
      }
    }),

  /**
   * Remove scopes from an engram. Rejects if it would leave zero scopes.
   */
  remove: protectedProcedure
    .input(
      z.object({
        engramId: engramIdSchema,
        scopes: scopesArraySchema,
      })
    )
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
        const updated = svc.update(input.engramId, { scopes: remaining });
        return { engram: updated };
      } catch (err) {
        toTrpcError(err);
      }
    }),

  /**
   * Bulk rename: replace `fromScope` prefix across all matching engrams.
   * Atomic — rolls back all file writes if any single write fails.
   * When `dryRun` is true, returns the count and IDs without modifying anything.
   */
  reclassify: protectedProcedure
    .input(
      z.object({
        fromScope: scopePrefixSchema,
        toScope: scopePrefixSchema,
        dryRun: z.boolean().optional(),
      })
    )
    .mutation(({ input }) => {
      try {
        const db = getDrizzle();
        const root = getEngramRoot();

        const targets = findReclassifyTargets(db, input.fromScope, input.toScope);

        if (targets.length === 0) {
          return { affected: 0 };
        }

        // Group by engram to build the full new-scopes list per engram.
        const byEngram = new Map<
          string,
          { oldScopes: Set<string>; newScopes: Map<string, string> }
        >();
        for (const t of targets) {
          let entry = byEngram.get(t.engramId);
          if (!entry) {
            entry = { oldScopes: new Set(), newScopes: new Map() };
            byEngram.set(t.engramId, entry);
          }
          entry.oldScopes.add(t.oldScope);
          entry.newScopes.set(t.oldScope, t.newScope);
        }

        const affectedIds = [...byEngram.keys()];

        if (input.dryRun) {
          return { affected: affectedIds.length, engrams: affectedIds };
        }

        // Load file paths for affected engrams.
        const indexRows = db
          .select({ id: engramIndex.id, filePath: engramIndex.filePath })
          .from(engramIndex)
          .where(inArray(engramIndex.id, affectedIds))
          .all();

        // Prepare (absPath, originalContent, newContent) for each engram.
        type WorkItem = {
          absPath: string;
          originalContent: string;
          newContent: string;
          id: string;
          newScopesList: string[];
          oldScopeSet: Set<string>;
        };
        const work: WorkItem[] = [];

        for (const row of indexRows) {
          const entry = byEngram.get(row.id);
          if (!entry) continue;

          const absPath = join(root, row.filePath);
          const originalContent = readFileSync(absPath, 'utf8');
          const { frontmatter, body } = parseEngramFile(originalContent);

          const newScopesList = frontmatter.scopes.map((s) => entry.newScopes.get(s) ?? s);
          const newFrontmatter = {
            ...frontmatter,
            scopes: [...new Set(newScopesList)],
            modified: new Date().toISOString(),
          };
          const newContent = serializeEngram(newFrontmatter, body);
          work.push({
            absPath,
            originalContent,
            newContent,
            id: row.id,
            newScopesList: newFrontmatter.scopes,
            oldScopeSet: entry.oldScopes,
          });
        }

        // Atomic file writes with rollback.
        const written: WorkItem[] = [];
        try {
          for (const item of work) {
            writeFileAtomic(item.absPath, item.newContent);
            written.push(item);
          }
        } catch (err) {
          // Rollback: restore every file we already wrote.
          for (const item of written) {
            try {
              writeFileAtomic(item.absPath, item.originalContent);
            } catch (restoreErr) {
              console.error(
                `[cerebrum] reclassify rollback: failed to restore ${item.absPath}: ${(restoreErr as Error).message}`
              );
            }
          }
          throw new ValidationError({
            message: `reclassify failed and was rolled back: ${(err as Error).message}`,
          });
        }

        // All files written — update DB atomically. If the DB update fails,
        // restore the written files so the filesystem and DB stay consistent.
        try {
          db.transaction((tx) => {
            for (const item of work) {
              // Remove old scopes that were replaced.
              for (const oldScope of item.oldScopeSet) {
                tx.delete(engramScopes)
                  .where(
                    sql`${engramScopes.engramId} = ${item.id} AND ${engramScopes.scope} = ${oldScope}`
                  )
                  .run();
              }
              // Insert new scopes.
              for (const newScope of item.newScopesList) {
                tx.insert(engramScopes)
                  .values({ engramId: item.id, scope: newScope })
                  .onConflictDoNothing()
                  .run();
              }
              // Update modified_at in index.
              tx.update(engramIndex)
                .set({ modifiedAt: new Date().toISOString() })
                .where(eq(engramIndex.id, item.id))
                .run();
            }
          });
        } catch (dbErr) {
          // DB failed — restore all file writes to keep filesystem and DB in sync.
          for (const item of written) {
            try {
              writeFileAtomic(item.absPath, item.originalContent);
            } catch (restoreErr) {
              console.error(
                `[cerebrum] reclassify DB rollback: failed to restore ${item.absPath}: ${(restoreErr as Error).message}`
              );
            }
          }
          throw new ValidationError({
            message: `reclassify DB update failed and file changes were rolled back: ${(dbErr as Error).message}`,
          });
        }

        return { affected: affectedIds.length };
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
      const db = getDrizzle();
      const scopes = listScopes(db, input?.prefix);
      return { scopes };
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
  filter: protectedProcedure
    .input(
      z.object({
        scopes: z.array(scopePrefixSchema),
        includeSecret: z.boolean().optional(),
      })
    )
    .query(({ input }) => {
      try {
        const db = getDrizzle();
        const { engramIds } = filterByScopes({
          scopes: input.scopes,
          includeSecret: input.includeSecret,
          db,
        });

        if (engramIds.length === 0) return { engrams: [] };

        const svc = getEngramService();
        const { engrams } = svc.list({ ids: engramIds });
        return { engrams };
      } catch (err) {
        toTrpcError(err);
      }
    }),
});
