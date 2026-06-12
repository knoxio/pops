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
 * Today the slice covers:
 *   - `nudge_log` (Track M5 / PRD-149)
 *   - `engram_index` + `engram_scopes` + `engram_tags` + `engram_links`
 *     (PRD-179 US-01 — scaffold; consumers still write to the shared
 *     pops.db until US-03 flips them over)
 *
 * The remaining cerebrum tables (embeddings + embeddings_vec,
 * conversations, glia, plexus) add their entries here when their
 * cutovers land. Order matters when FKs are introduced across
 * cerebrum-owned tables — `engram_index` is copied first so the
 * cascading auxiliaries (`engram_scopes`, `engram_tags`, `engram_links`)
 * can satisfy their FK at insert time.
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
  {
    table: 'engram_index',
    idColumn: 'id',
    columns: [
      'id',
      'file_path',
      'type',
      'source',
      'status',
      'template',
      'created_at',
      'modified_at',
      'title',
      'content_hash',
      'body_hash',
      'word_count',
      'custom_fields',
    ],
  },
  {
    // engram_scopes has no surrogate id — the pair (engram_id, scope) is
    // unique. Use engram_id as the existence-filter column; once any row
    // for an engram is copied across, subsequent runs are no-ops for that
    // engram. New scopes added to a still-shared engram won't replicate,
    // which is acceptable: the cutover PR (US-03) routes new writes
    // through getCerebrumDrizzle() before this asymmetry matters.
    table: 'engram_scopes',
    idColumn: 'engram_id',
    columns: ['engram_id', 'scope'],
  },
  {
    table: 'engram_tags',
    idColumn: 'engram_id',
    columns: ['engram_id', 'tag'],
  },
  {
    table: 'engram_links',
    idColumn: 'source_id',
    columns: ['source_id', 'target_id'],
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
