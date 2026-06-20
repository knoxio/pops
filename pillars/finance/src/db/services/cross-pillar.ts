/**
 * Cross-pillar owner-URI helpers for the finance pillar (PRD-251 US-03).
 *
 * `budgets.owner_uri` holds a soft, URI-shaped reference into the core
 * pillar (`pops://core/<type>/<id>`). The reconciliation cron in
 * `apps/pops-finance-api/src/cron/reconcile-cross-pillar.ts` walks the
 * distinct URIs, asks core whether each one still resolves, and uses
 * {@link markBudgetOwnerUriStale} / {@link clearBudgetOwnerUriStale}
 * to mark or clear the `owner_uri_stale_at` flag. Read-time fan-out is
 * forbidden per the PRD — the cron is the only writer.
 */
import { eq, isNotNull, sql } from 'drizzle-orm';

import { budgets } from '../schema.js';

import type { FinanceDb } from './internal.js';

/**
 * Return every distinct non-null `owner_uri` currently stored on
 * `budgets`. The cron uses this as the work set per nightly tick.
 */
export function listDistinctBudgetOwnerUris(db: FinanceDb): string[] {
  const rows = db
    .selectDistinct({ ownerUri: budgets.ownerUri })
    .from(budgets)
    .where(isNotNull(budgets.ownerUri))
    .all();
  const out: string[] = [];
  for (const row of rows) {
    if (row.ownerUri !== null) out.push(row.ownerUri);
  }
  return out;
}

/**
 * Mark every `budgets` row referencing `ownerUri` as stale (the owning
 * pillar returned 404 for the URI). Idempotent — re-setting the same
 * timestamp is fine; the row is not deleted. Returns the number of rows
 * affected.
 */
export function markBudgetOwnerUriStale(db: FinanceDb, ownerUri: string, nowIso: string): number {
  const result = db
    .update(budgets)
    .set({ ownerUriStaleAt: nowIso })
    .where(eq(budgets.ownerUri, ownerUri))
    .run();
  return result.changes;
}

/**
 * Clear the `owner_uri_stale_at` flag for every row referencing
 * `ownerUri` (the owning pillar reports the URI resolved again).
 * Returns the number of rows affected.
 */
export function clearBudgetOwnerUriStale(db: FinanceDb, ownerUri: string): number {
  const result = db
    .update(budgets)
    .set({ ownerUriStaleAt: null })
    .where(eq(budgets.ownerUri, ownerUri))
    .run();
  return result.changes;
}

/**
 * Backfill `owner_uri` from a legacy join column when the column exists
 * and the URI is currently NULL. Today the finance pillar has no legacy
 * join column on `budgets`, so the helper is a no-op — kept here so the
 * migration entry point has somewhere to call when (or if) a legacy
 * column is added by a follow-up data import.
 *
 * Returns the number of rows actually updated.
 */
export function backfillBudgetOwnerUriFromLegacy(db: FinanceDb): number {
  const legacy = legacyOwnerColumnExists(db);
  if (!legacy) return 0;
  const result = db.run(
    sql`UPDATE ${budgets} SET ${budgets.ownerUri} = 'pops://core/entities/' || legacy_owner_id WHERE ${budgets.ownerUri} IS NULL AND legacy_owner_id IS NOT NULL`
  );
  return result.changes;
}

function legacyOwnerColumnExists(db: FinanceDb): boolean {
  const rows = db.all<{ name: string }>(sql`PRAGMA table_info(budgets)`);
  for (const row of rows) {
    if (row.name === 'legacy_owner_id') return true;
  }
  return false;
}
