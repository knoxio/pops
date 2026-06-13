/**
 * Boot-time backfill from the legacy shared `pops.db` into the lists
 * pillar's `lists.db`.
 *
 * Phase 2 PR 3 of the lists pillar flips every lists module read +
 * write (`lists.list.*` and `lists.items.*`) to the lists handle. The
 * first deploy after PR 3 needs to carry the existing `lists` and
 * `list_items` rows from the shared DB across before any reads come
 * from the new file. Subsequent boots find the lists copy already
 * populated and become a no-op via the `WHERE id NOT IN (...)`
 * existence filter on every table.
 *
 * Order matters for FK enforcement (with `foreign_keys = ON`): the
 * `list_items.list_id` FK requires the parent `lists` row to exist
 * before children copy across. Parent first, then children.
 *
 * Each table is wrapped in `tryCopyTable` so a missing source table
 * (post-PR-4 drop scenario, or a stale on-disk pops.db) doesn't bring
 * the whole backfill down. Failures are logged + swallowed; the
 * remaining tables still attempt.
 *
 * Non-fatal: ATTACH or INSERT failures are logged and swallowed so a
 * stale on-disk pops.db never bricks the boot path. Partial failures
 * leave the lists copy partially populated; the next deploy retries
 * and the idempotent filter picks up only the still-missing rows.
 *
 * Mirrors `backfill-inventory-from-shared.ts` / `backfill-finance-from-
 * shared.ts` / `backfill-media-from-shared.ts` / `backfill-cerebrum-
 * from-shared.ts`.
 */
import type Database from 'better-sqlite3';

import type { OpenedListsDb } from '@pops/lists-db';

interface TableCopy {
  readonly table: string;
  /**
   * Explicit column list keeps the backfill robust against a stale
   * on-disk pops.db that already widened or narrowed since the boot
   * image was built.
   */
  readonly columns: readonly string[];
  /** Identifier column used in the existence filter. */
  readonly idColumn: string;
}

const TABLE_COPIES: readonly TableCopy[] = [
  {
    table: 'lists',
    idColumn: 'id',
    columns: ['id', 'name', 'kind', 'owner_app', 'archived_at', 'created_at'],
  },
  {
    table: 'list_items',
    idColumn: 'id',
    columns: [
      'id',
      'list_id',
      'position',
      'label',
      'qty',
      'unit',
      'ref_kind',
      'ref_id',
      'checked',
      'checked_at',
      'due_at',
      'notes',
      'created_at',
    ],
  },
];

function tryCopyTable(raw: Database.Database, copy: TableCopy): void {
  try {
    const hasTable = raw
      .prepare(`SELECT 1 FROM pops.sqlite_master WHERE type='table' AND name='${copy.table}'`)
      .get();
    if (!hasTable) return;
    const cols = copy.columns.join(', ');
    raw.exec(`
      INSERT INTO ${copy.table} (${cols})
      SELECT ${cols}
      FROM pops.${copy.table}
      WHERE ${copy.idColumn} NOT IN (SELECT ${copy.idColumn} FROM ${copy.table})
    `);
  } catch (err) {
    console.warn(`[db] Lists backfill of ${copy.table} failed (non-fatal):`, err);
  }
}

/**
 * Copy `lists` + `list_items` rows from `pops.db` into `lists.db`, in
 * FK-safe order (parent before children), idempotent against re-runs.
 *
 * Caller is responsible for supplying the lists handle (so this
 * module stays decoupled from the lazy singleton in
 * `db/lists-handle.ts`). Production wiring passes the result of
 * `getListsDrizzle()` after the eager-open block; tests pass an
 * in-memory handle with a tmpdir copy of the shared DB pre-populated.
 */
export function backfillListsFromShared(lists: OpenedListsDb, sharedPath: string): void {
  try {
    lists.raw.prepare('ATTACH DATABASE ? AS pops').run(sharedPath);
    try {
      for (const copy of TABLE_COPIES) tryCopyTable(lists.raw, copy);
    } finally {
      lists.raw.exec('DETACH DATABASE pops');
    }
  } catch (err) {
    console.warn('[db] Lists backfill ATTACH failed (non-fatal):', err);
  }
}
