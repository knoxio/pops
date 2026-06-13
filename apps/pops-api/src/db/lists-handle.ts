/**
 * Lazily-initialised handle to the lists pillar's SQLite file.
 *
 * Phase 2 PR 2 opened the connection (and applied the in-package
 * migrations journal) at boot. PR 3 routed every lists module read +
 * write (`lists.list.*` and `lists.items.*`) through
 * `getListsDrizzle()` and ran a one-shot ATTACH-based backfill from
 * the legacy shared pops.db. PR 4 (Theme 13) retired the backfill —
 * every lists-owned table now writes directly to `lists.db`, so the
 * boot bridge has nothing left to carry forward.
 *
 * Lives in its own module so `db.ts` stays under the lint cap as more
 * pillars come online. Mirrors `core-handle.ts` / `inventory-handle.ts` /
 * `finance-handle.ts` / `media-db-handle.ts` / `cerebrum-handle.ts` /
 * `food-handle.ts`.
 */
import { drizzle } from 'drizzle-orm/better-sqlite3';

import { openListsDb, type ListsDb, type OpenedListsDb } from '@pops/lists-db';

import { getDb, isNamedEnvContext } from '../db.js';
import { resolveListsSqlitePath } from './lists-sqlite-path.js';

let listsDb: OpenedListsDb | null = null;

/**
 * Resolve (and lazily open) the lists pillar's drizzle handle.
 *
 * **Env-aware**: inside a `withEnvDb()` scope (PRD-101 named environments —
 * each E2E test fixture creates a per-test pops.db with its own seeded
 * lists tables) the env DB takes precedence. The env DB already contains
 * every lists-owned table because `seedDatabase()` writes them there, so
 * a single fixture stays self-contained without a background backfill
 * into the global `lists.db`. Outside an env scope (real production
 * boot, dev), the pillar's `lists.db` is resolved + lazily opened so
 * the in-package migrations apply.
 *
 * The handle is opened on first call so per-pillar migrations land
 * before any request hits the API. Phase 2 PR 3 routes the list_items
 * slice's reads/writes through this getter.
 */
export function getListsDrizzle(): ListsDb {
  if (isNamedEnvContext()) return drizzle(getDb()) as ListsDb;
  if (!listsDb) {
    listsDb = openListsDb(resolveListsSqlitePath());
  }
  return listsDb.db;
}

/**
 * Resolve the lists pillar's raw better-sqlite3 handle. Same lazy
 * open + env-aware behaviour as `getListsDrizzle()` — exposed for
 * the same lower-level needs (`.transaction()`, `.prepare()`,
 * `.pragma()`) that the drizzle wrapper hides. Prefer
 * `getListsDrizzle()` for everything that doesn't need it.
 */
export function getListsRawDb(): OpenedListsDb['raw'] {
  if (isNamedEnvContext()) return getDb();
  if (!listsDb) {
    listsDb = openListsDb(resolveListsSqlitePath());
  }
  return listsDb.raw;
}

/**
 * Close the lists pillar's connection if it was opened. Idempotent
 * — safe to call from `closeDb()` on shutdown even when the lists
 * handle was never resolved.
 */
export function closeListsDb(): void {
  if (listsDb) {
    listsDb.raw.close();
    listsDb = null;
  }
}

/**
 * Test-only: swap the lists pillar handle. `setupTestContext` in
 * `shared/test-utils.ts` calls this hook so test suites can inject an
 * in-memory DB and avoid writing to the dev `data/lists.db` file.
 * Returns the previous handle (or null).
 */
export function setListsDb(next: OpenedListsDb | null): OpenedListsDb | null {
  const prev = listsDb;
  listsDb = next;
  return prev;
}
