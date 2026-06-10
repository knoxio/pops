/**
 * Boot-time backfill from the legacy shared `pops.db` into the cerebrum
 * pillar's `cerebrum.db`.
 *
 * Phase 2 PR 3 of the cerebrum pillar flips NudgeService reads/writes
 * to the cerebrum handle. The first deploy after PR 3 needs to carry
 * the existing nudge_log rows from the shared DB across before any
 * reads come from the new file. Subsequent boots find the cerebrum
 * copy already populated and become a no-op via the
 * `WHERE id NOT IN (...)` existence filter.
 *
 * Today the slice only covers the `nudge_log` table; the engrams +
 * embeddings + conversations + glia + plexus slices add their entries
 * here when their cutovers land. Order matters when FKs are introduced
 * across cerebrum-owned tables — for the nudge_log-only slice the
 * order is trivial.
 *
 * Non-fatal: ATTACH or INSERT failures are logged and swallowed so a
 * stale on-disk pops.db never bricks the boot path. Partial failures
 * leave the cerebrum copy partially populated; the next deploy retries
 * and the idempotent filter picks up only the still-missing rows.
 *
 * Mirrors `backfill-inventory-from-shared.ts` / `backfill-finance-from-
 * shared.ts` / `backfill-media-from-shared.ts`.
 */
import type Database from 'better-sqlite3';

import type { OpenedCerebrumDb } from '@pops/cerebrum-db';

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
    table: 'nudge_log',
    idColumn: 'id',
    columns: [
      'id',
      'type',
      'title',
      'body',
      'engram_ids',
      'priority',
      'status',
      'created_at',
      'expires_at',
      'acted_at',
      'action_type',
      'action_label',
      'action_params',
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
    console.warn(`[db] Cerebrum backfill of ${copy.table} failed (non-fatal):`, err);
  }
}

/**
 * Copy every cerebrum-owned table's rows from `pops.db` into
 * `cerebrum.db`, idempotent against re-runs.
 *
 * Caller is responsible for supplying the cerebrum handle (so this
 * module stays decoupled from the lazy singleton in
 * `db/cerebrum-handle.ts`). Production wiring passes the result of
 * `getCerebrumDrizzle()` after the eager-open block; tests pass an
 * in-memory handle with a tmpdir copy of the shared DB pre-populated.
 */
export function backfillCerebrumFromShared(cerebrum: OpenedCerebrumDb, sharedPath: string): void {
  try {
    cerebrum.raw.prepare('ATTACH DATABASE ? AS pops').run(sharedPath);
    try {
      for (const copy of TABLE_COPIES) tryCopyTable(cerebrum.raw, copy);
    } finally {
      cerebrum.raw.exec('DETACH DATABASE pops');
    }
  } catch (err) {
    console.warn('[db] Cerebrum backfill ATTACH failed (non-fatal):', err);
  }
}
