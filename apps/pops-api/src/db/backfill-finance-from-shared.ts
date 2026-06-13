/**
 * Boot-time backfill from the legacy shared `pops.db` into the finance
 * pillar's `finance.db`.
 *
 * Track N (per-pillar cutover) flips finance consumers from the shared
 * `pops.db` to the dedicated `finance.db`. The first deploy after each
 * slice cutover needs to carry the existing rows from the shared DB
 * across before any reads come from the new file. Subsequent boots
 * find the finance copy already populated and become a no-op via the
 * `WHERE id NOT IN (...)` existence filter on every table.
 *
 * Order matters for FK enforcement (with `foreign_keys = ON`):
 *   entities (no parent)
 *     → transactions (FK → entities)
 *
 * `wish_list` was retired from the bridge once its read + write surface
 * landed entirely on `finance.db` (Theme 13, PRD-212 PR4).
 *
 * `transaction_corrections`, `transaction_tag_rules`, `tag_vocabulary`,
 * and `budgets` were retired from the bridge once every consumer (core
 * corrections handlers, finance-internal modules, the tag-suggester job,
 * and finance budgets/search adapters) had been flipped to
 * `getFinanceDrizzle()` (Theme 13 PR4 round 2). `entities` and
 * `transactions` stay on the bridge because `core/entities/service.ts`
 * and `core/entities/search-adapter.ts` still read + write the shared
 * `pops.db` via `getDrizzle()`.
 *
 * Each table is wrapped in `tryCopyTable` so a missing source table
 * (post-PR-4 drop scenario, or a stale on-disk pops.db) doesn't bring
 * the whole backfill down. Failures are logged + swallowed; the
 * remaining tables still attempt.
 *
 * Non-fatal: ATTACH or INSERT failures are logged and swallowed so a
 * stale on-disk pops.db never bricks the boot path. Failures here
 * leave the finance copy partially populated for that boot; the next
 * deploy retries and the idempotent filter picks up only the
 * still-missing rows.
 */
import type Database from 'better-sqlite3';

import type { OpenedFinanceDb } from '@pops/finance-db';

interface TableCopy {
  readonly table: string;
  /** Explicit column list keeps the backfill robust against a stale
   * on-disk pops.db that already widened or narrowed since the boot
   * image was built. */
  readonly columns: readonly string[];
  /** Identifier column used in the existence filter. */
  readonly idColumn: string;
}

const TABLE_COPIES: readonly TableCopy[] = [
  {
    table: 'entities',
    idColumn: 'id',
    columns: [
      'id',
      'notion_id',
      'name',
      'type',
      'abn',
      'aliases',
      'default_transaction_type',
      'default_tags',
      'notes',
      'last_edited_time',
    ],
  },
  {
    table: 'transactions',
    idColumn: 'id',
    columns: [
      'id',
      'notion_id',
      'description',
      'account',
      'amount',
      'date',
      'type',
      'tags',
      'entity_id',
      'entity_name',
      'location',
      'country',
      'related_transaction_id',
      'notes',
      'checksum',
      'raw_row',
      'last_edited_time',
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
    console.warn(`[db] Finance backfill of ${copy.table} failed (non-fatal):`, err);
  }
}

/**
 * Copy every finance-owned table's rows from `pops.db` into
 * `finance.db`, in FK-safe order, idempotent against re-runs.
 *
 * Caller is responsible for supplying the finance handle (so this
 * module stays decoupled from the lazy singleton in
 * `db/finance-handle.ts`). Production wiring passes the result of
 * `getFinanceDrizzle()` after the eager-open block; tests pass an
 * in-memory handle with a tmpdir copy of the shared DB pre-populated.
 */
export function backfillFinanceFromShared(finance: OpenedFinanceDb, sharedPath: string): void {
  try {
    finance.raw.prepare('ATTACH DATABASE ? AS pops').run(sharedPath);
    try {
      for (const copy of TABLE_COPIES) tryCopyTable(finance.raw, copy);
    } finally {
      finance.raw.exec('DETACH DATABASE pops');
    }
  } catch (err) {
    console.warn('[db] Finance backfill ATTACH failed (non-fatal):', err);
  }
}
