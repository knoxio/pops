/**
 * Lazily-initialised handle to the cerebrum pillar's SQLite file.
 *
 * Phase 2 PR 2 of the cerebrum pillar migration: opens the connection
 * (and applies the in-package migrations journal) at boot but does NOT
 * yet route any production traffic through it. PR 3 of phase 2 flips
 * the nudge_log slice (NudgeService) over with a single edit to
 * `getDrizzle()` → `getCerebrumDrizzle()` plus an ATTACH-based
 * backfill of any existing nudge_log rows from the shared pops.db; PR 4
 * drops the cerebrum-owned tags from the shared journal + adds the
 * Litestream config.
 *
 * Lives in its own module so `db.ts` stays under the lint cap as more
 * pillars come online. Mirrors `core-handle.ts` / `inventory-handle.ts` /
 * `finance-handle.ts`.
 */
import { drizzle } from 'drizzle-orm/better-sqlite3';

import { openCerebrumDb, type CerebrumDb, type OpenedCerebrumDb } from '@pops/cerebrum-db';

import { getDb, isNamedEnvContext } from '../db.js';
import { backfillCerebrumFromShared } from './backfill-cerebrum-from-shared.js';
import { resolveCerebrumSqlitePath } from './cerebrum-sqlite-path.js';

let cerebrumDb: OpenedCerebrumDb | null = null;

/**
 * Resolve (and lazily open) the cerebrum pillar's drizzle handle.
 *
 * **Env-aware**: inside a `withEnvDb()` scope (PRD-101 named environments —
 * each E2E test fixture creates a per-test pops.db with its own seeded
 * cerebrum tables) the env DB takes precedence. The env DB already
 * contains every cerebrum-owned table because `seedDatabase()` writes
 * them there, so a single fixture stays self-contained without a
 * background backfill into the global `cerebrum.db`. Outside an env
 * scope (real production boot, dev), the pillar's `cerebrum.db` is
 * resolved + lazily opened so the in-package migrations apply.
 *
 * The handle is opened on first call so per-pillar migrations land
 * before any request hits the API. Phase 2 PR 3 routes the nudge_log
 * slice's reads/writes through this getter.
 */
export function getCerebrumDrizzle(): CerebrumDb {
  if (isNamedEnvContext()) return drizzle(getDb()) as CerebrumDb;
  if (!cerebrumDb) {
    cerebrumDb = openCerebrumDb(resolveCerebrumSqlitePath());
  }
  return cerebrumDb.db;
}

/**
 * Resolve the cerebrum pillar's raw better-sqlite3 handle. Same lazy
 * open + env-aware behaviour as `getCerebrumDrizzle()` — exposed for
 * the same lower-level needs (`.transaction()`, `.prepare()`,
 * `.pragma()`) that the drizzle wrapper hides. Prefer
 * `getCerebrumDrizzle()` for everything that doesn't need it.
 */
export function getCerebrumRawDb(): OpenedCerebrumDb['raw'] {
  if (isNamedEnvContext()) return getDb();
  if (!cerebrumDb) {
    cerebrumDb = openCerebrumDb(resolveCerebrumSqlitePath());
  }
  return cerebrumDb.raw;
}

/**
 * Close the cerebrum pillar's connection if it was opened. Idempotent
 * — safe to call from `closeDb()` on shutdown even when the cerebrum
 * handle was never resolved.
 */
export function closeCerebrumDb(): void {
  if (cerebrumDb) {
    cerebrumDb.raw.close();
    cerebrumDb = null;
  }
}

/**
 * Test-only: swap the cerebrum pillar handle. Phase 2 PR 3 of this
 * pillar wires `setupTestContext` (in `shared/test-utils.ts`) up to
 * call this hook so test suites can inject an in-memory DB and avoid
 * writing to the dev `data/cerebrum.db` file. Returns the previous
 * handle (or null).
 */
export function setCerebrumDb(next: OpenedCerebrumDb | null): OpenedCerebrumDb | null {
  const prev = cerebrumDb;
  cerebrumDb = next;
  return prev;
}

/**
 * Run the one-shot ATTACH backfill from the legacy shared pops.db into
 * the cerebrum pillar's cerebrum.db. No-op if the cerebrum handle isn't
 * open (e.g. boot still resolving). Idempotent against repeated boots
 * via per-table `WHERE id NOT IN (...)` filters. See
 * `backfill-cerebrum-from-shared.ts` for the table-by-table behaviour.
 */
export function backfillCerebrumFromSharedDb(sharedPath: string): void {
  if (!cerebrumDb) return;
  backfillCerebrumFromShared(cerebrumDb, sharedPath);
}
