/**
 * Cross-pillar URI denormalisation helpers (PRD-251 H7).
 *
 * The reconciliation cron in `apps/pops-inventory-api` walks the distinct
 * `purchase_transaction_uri` / `owner_uri` values stored on `home_inventory`
 * rows and asks the owning pillar whether each still resolves. To keep the
 * cron HTTP-shaped and the persistence layer concern-free, this module only
 * exposes the two operations the cron actually needs:
 *
 *   - `listDistinct*Uris` — read-side fan-out
 *   - `mark*Stale` / `clear*Stale` — write-side reconciliation
 *
 * The stale columns are best-effort warnings, not deletes — see PRD-251 §
 * "Business Rules → Existence is best-effort".
 */
import { eq, isNotNull } from 'drizzle-orm';

import { homeInventory } from '../schema.js';

import type { InventoryDb } from './internal.js';

/** Return every distinct, non-null `purchase_transaction_uri` on inventory rows. */
export function listDistinctPurchaseTransactionUris(db: InventoryDb): string[] {
  const rows = db
    .selectDistinct({ uri: homeInventory.purchaseTransactionUri })
    .from(homeInventory)
    .where(isNotNull(homeInventory.purchaseTransactionUri))
    .all();
  return rows.map((r) => r.uri).filter((u): u is string => typeof u === 'string' && u.length > 0);
}

/** Return every distinct, non-null `owner_uri` on inventory rows. */
export function listDistinctOwnerUris(db: InventoryDb): string[] {
  const rows = db
    .selectDistinct({ uri: homeInventory.ownerUri })
    .from(homeInventory)
    .where(isNotNull(homeInventory.ownerUri))
    .all();
  return rows.map((r) => r.uri).filter((u): u is string => typeof u === 'string' && u.length > 0);
}

/**
 * Stamp `purchase_transaction_stale_at` on every row pointing at `uri`. The
 * caller passes the cron tick's `now()` so tests can pin time deterministically.
 */
export function markPurchaseTransactionUriStale(
  db: InventoryDb,
  uri: string,
  stampIso: string
): number {
  const result = db
    .update(homeInventory)
    .set({ purchaseTransactionStaleAt: stampIso })
    .where(eq(homeInventory.purchaseTransactionUri, uri))
    .run();
  return result.changes;
}

/** Clear staleness — used when an earlier 404 resolves on a later tick. */
export function clearPurchaseTransactionUriStale(db: InventoryDb, uri: string): number {
  const result = db
    .update(homeInventory)
    .set({ purchaseTransactionStaleAt: null })
    .where(eq(homeInventory.purchaseTransactionUri, uri))
    .run();
  return result.changes;
}

/** Stamp `owner_stale_at` on every row pointing at `uri`. */
export function markOwnerUriStale(db: InventoryDb, uri: string, stampIso: string): number {
  const result = db
    .update(homeInventory)
    .set({ ownerStaleAt: stampIso })
    .where(eq(homeInventory.ownerUri, uri))
    .run();
  return result.changes;
}

/** Clear `owner_stale_at` — used when an earlier 404 resolves on a later tick. */
export function clearOwnerUriStale(db: InventoryDb, uri: string): number {
  const result = db
    .update(homeInventory)
    .set({ ownerStaleAt: null })
    .where(eq(homeInventory.ownerUri, uri))
    .run();
  return result.changes;
}
