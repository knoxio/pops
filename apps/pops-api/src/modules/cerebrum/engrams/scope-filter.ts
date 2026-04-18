/**
 * Query-time scope filtering.
 *
 * `filterByScopes` is the only exported function that touches the database.
 * `inferScopesFromContext` is a pure keyword map with no side effects.
 *
 * Secret scope hard-blocking: any engram with at least one scope containing a
 * segment named exactly `secret` (at any position) is excluded unless the
 * caller explicitly sets `includeSecret: true`.
 */
import { like, or, sql } from 'drizzle-orm';

import { engramScopes } from '@pops/db-types';

import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

export interface FilterByScopesOptions {
  /** Scope prefixes to match. Empty array = no scope filter (all engrams). */
  scopes: string[];
  /** When true, secret-scoped engrams are included. Default: false. */
  includeSecret?: boolean;
  db: BetterSQLite3Database;
}

export interface FilterByScopesResult {
  /** Engram IDs that satisfy the scope filter. */
  engramIds: string[];
}

/**
 * Return the set of engram IDs that match the requested scope prefixes,
 * excluding secret-scoped engrams unless `includeSecret` is true.
 *
 * An empty `scopes` array means "no scope restriction" — returns all engram
 * IDs that are not excluded by the secret rule.
 *
 * Uses the `scope` index on `engram_scopes` for prefix queries.
 */
export function filterByScopes(opts: FilterByScopesOptions): FilterByScopesResult {
  const { scopes, includeSecret = false, db } = opts;

  // Step 1: Collect IDs of secret-scoped engrams (for hard-blocking).
  const secretIds = includeSecret ? new Set<string>() : getSecretEngramIds(db);

  // Step 2: Collect IDs matching the scope prefixes.
  let matchingIds: string[];
  if (scopes.length === 0) {
    // No scope filter — get all engram IDs from the index table.
    matchingIds = getAllEngramIds(db);
  } else {
    matchingIds = getScopeMatchingIds(db, scopes);
  }

  // Step 3: Remove secret-scoped engrams unless opted in.
  const result = matchingIds.filter((id) => !secretIds.has(id));
  return { engramIds: result };
}

/** Fetch all engram IDs that have at least one secret scope. */
function getSecretEngramIds(db: BetterSQLite3Database): Set<string> {
  // Any scope containing a segment exactly named 'secret' is treated as secret,
  // regardless of position. Three LIKE patterns cover middle, start, and end.
  const rows = db
    .select({ engramId: engramScopes.engramId })
    .from(engramScopes)
    .where(
      or(
        like(engramScopes.scope, '%.secret.%'),
        like(engramScopes.scope, 'secret.%'),
        like(engramScopes.scope, '%.secret')
      )
    )
    .all();
  return new Set(rows.map((r) => r.engramId));
}

/** Fetch all engram IDs from the scopes table (distinct). */
function getAllEngramIds(db: BetterSQLite3Database): string[] {
  const rows = db.selectDistinct({ engramId: engramScopes.engramId }).from(engramScopes).all();
  return rows.map((r) => r.engramId);
}

/**
 * Return engram IDs where at least one stored scope matches any of the
 * requested prefix patterns. Uses SQL LIKE for prefix queries.
 */
function getScopeMatchingIds(db: BetterSQLite3Database, scopes: string[]): string[] {
  // Build a LIKE condition per prefix. A stored scope matches prefix `p` when:
  //   scope = p           (exact match)
  //   scope LIKE 'p.%'   (child scope)
  const conditions = scopes.flatMap((prefix) => [
    sql`${engramScopes.scope} = ${prefix}`,
    like(engramScopes.scope, `${prefix}.%`),
  ]);

  const rows = db
    .selectDistinct({ engramId: engramScopes.engramId })
    .from(engramScopes)
    .where(or(...conditions))
    .all();

  return rows.map((r) => r.engramId);
}

// ---------------------------------------------------------------------------
// Context inference
// ---------------------------------------------------------------------------

/** Map from keyword to scope prefix. */
const CONTEXT_MAP: Record<string, string[]> = {
  work: ['work'],
  'at work': ['work'],
  'work context': ['work'],
  personal: ['personal'],
  'personal context': ['personal'],
  storage: ['storage'],
  journal: ['personal.journal'],
  captures: ['personal.captures'],
};

/**
 * Map free-text contextual hints to scope prefix arrays.
 * This is a simple keyword map — LLM-based inference is out of scope (PRD-081).
 *
 * @example
 * inferScopesFromContext("at work")   // ["work"]
 * inferScopesFromContext("personal")  // ["personal"]
 */
export function inferScopesFromContext(hint: string): string[] {
  const normalised = hint.trim().toLowerCase();
  const mapped = CONTEXT_MAP[normalised];
  if (mapped) return mapped;

  // Fall back to checking if any key is contained in the hint
  for (const [key, prefixes] of Object.entries(CONTEXT_MAP)) {
    if (normalised.includes(key)) return prefixes;
  }

  return [];
}
