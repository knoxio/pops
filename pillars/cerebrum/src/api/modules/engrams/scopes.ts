/**
 * Scope vocabulary queries over `engram_scopes`.
 *
 * `listScopes` powers the scope picker / typeahead and feeds the
 * reconciliation service its known-vocabulary set. Pure SQL projection — no
 * filesystem, no scope-rule evaluation.
 */
import { count, eq, like, or } from 'drizzle-orm';

import { engramScopes, type CerebrumDb } from '../../../db/index.js';
import { normaliseScope } from './scope-schema.js';

export interface ScopeInfo {
  scope: string;
  count: number;
}

/**
 * List all distinct scopes with engram counts. If `prefix` is provided,
 * only scopes that are equal to or children of the prefix are returned.
 */
export function listScopes(db: CerebrumDb, prefix?: string): ScopeInfo[] {
  const norm = prefix !== undefined && prefix.trim() !== '' ? normaliseScope(prefix) : undefined;
  const q = db.select({ scope: engramScopes.scope, total: count() }).from(engramScopes).$dynamic();
  const rows = (
    norm ? q.where(or(eq(engramScopes.scope, norm), like(engramScopes.scope, `${norm}.%`))) : q
  )
    .groupBy(engramScopes.scope)
    .all();
  return rows.map((r) => ({ scope: r.scope, count: r.total }));
}
