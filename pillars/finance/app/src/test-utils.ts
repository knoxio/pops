/**
 * Shared helpers for this pillar's unit suites.
 *
 * Sibling of `test-setup.ts`: imported by tests, never by app code.
 */

/**
 * Read `index` out of `items`, throwing when that slot is empty.
 *
 * Under `noUncheckedIndexedAccess` every indexed read is `T | undefined`, and
 * testing-library's `getAllBy*` / `querySelectorAll` results are no exception.
 * An assertion that indexes one has to either weaken to optional chaining —
 * which reports a value mismatch when the real fault is a missing element — or
 * assert non-null. This throws at the index that was missing instead.
 */
export function elementAt<T>(items: ArrayLike<T>, index: number): T {
  const item = items[index];
  if (item === undefined) {
    throw new Error(`expected an element at index ${index}, collection has ${items.length}`);
  }
  return item;
}

/**
 * The balance every account carries on the wire (finance ADR-002), for a fixture that
 * only needs the field to exist. `transactions` basis with a zero figure is
 * the honest shape for an account with nothing on it — a test wanting a real
 * balance overrides it rather than starting from a made-up number.
 */
export const NO_BALANCE = {
  balanceCents: 0,
  asOf: '2026-01-01',
  basis: 'transactions',
  anchor: null,
  inconsistent: false,
} as const;

/** The import status every account carries on the wire (POPS-2917): an account never imported into. */
export const NO_IMPORT_STATUS = {
  lastImportAt: null,
  lastSyncedAt: null,
  lastBatchId: null,
  newestTransactionDate: null,
  span: null,
  cadenceDays: null,
  source: null,
} as const;

/** The transaction count every account carries on the wire (POPS-2924): an account with none on it. */
export const NO_TRANSACTION_COUNT = 0;
