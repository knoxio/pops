/**
 * Boot-time backfill from the legacy shared `pops.db` into the cerebrum
 * pillar's `cerebrum.db`.
 *
 * Phase 2 PR 3 of the cerebrum pillar flips NudgeService reads/writes
 * to the cerebrum handle. The first deploy after PR 3 needs to carry
 * the existing nudge_log rows from the shared DB across before any
 * reads come from the new file. Subsequent boots find the cerebrum
 * copy already populated and become a no-op via the
 * `WHERE NOT EXISTS (...)` existence filter (composite-key aware for
 * junction tables like `conversation_context`).
 *
 * Today the slice covers:
 *   - `nudge_log` (Track M5 / PRD-149)
 *   - `engram_index` + `engram_scopes` + `engram_tags` + `engram_links`
 *     (PRD-179 US-01 — scaffold; consumers still write to the shared
 *     pops.db until US-03 flips them over)
 *   - `glia_actions` + `glia_trust_state` (PRD-181 US-01 — scaffold;
 *     consumers still write to the shared pops.db until US-03 flips
 *     them over)
 *   - `conversations` + `messages` + `conversation_context` (PRD-182
 *     US-01 — scaffold; consumers still write to the shared pops.db
 *     until PR 3 flips them over)
 *
 * The remaining cerebrum tables (embeddings + embeddings_vec, plexus)
 * add their entries here when their cutovers land. Order matters when
 * FKs are introduced across cerebrum-owned tables — `engram_index` is
 * copied first so the cascading auxiliaries (`engram_scopes`,
 * `engram_tags`, `engram_links`) can satisfy their FK at insert time.
 * The two glia tables have no cross-table FKs so their order is
 * independent of the engram block. The conversations block has an FK
 * from `messages` and `conversation_context` to `conversations`, so the
 * parent table is copied first.
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
  /**
   * Identifier column(s) used in the existence filter. A single entry
   * covers tables with a surrogate PK; multiple entries express a
   * composite key on junction tables (e.g. `conversation_context`)
   * where row identity is the tuple, not a single column.
   */
  readonly idColumns: readonly [string, ...string[]];
}

const TABLE_COPIES: readonly TableCopy[] = [
  {
    table: 'nudge_log',
    idColumns: ['id'],
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
    idColumns: ['id'],
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
    // unique. Filter on the composite tuple so new scopes added to an
    // already-copied engram still converge on subsequent boots.
    table: 'engram_scopes',
    idColumns: ['engram_id', 'scope'],
    columns: ['engram_id', 'scope'],
  },
  {
    table: 'engram_tags',
    idColumns: ['engram_id', 'tag'],
    columns: ['engram_id', 'tag'],
  },
  {
    table: 'engram_links',
    idColumns: ['source_id', 'target_id'],
    columns: ['source_id', 'target_id'],
  },
  {
    table: 'glia_actions',
    idColumns: ['id'],
    columns: [
      'id',
      'action_type',
      'affected_ids',
      'rationale',
      'payload',
      'phase',
      'status',
      'user_decision',
      'user_note',
      'executed_at',
      'decided_at',
      'reverted_at',
      'created_at',
    ],
  },
  {
    // glia_trust_state's PK is `action_type` — the same column doubles
    // as the existence-filter source. Once a row for an action type is
    // copied across, the WHERE NOT IN clause makes subsequent runs a
    // no-op for that type; new counter increments on the still-shared
    // row won't replicate, which is acceptable for the same reason
    // engram_scopes is: PR 3 (US-03) routes writes through the cerebrum
    // handle before any divergence matters.
    table: 'glia_trust_state',
    idColumns: ['action_type'],
    columns: [
      'action_type',
      'current_phase',
      'approved_count',
      'rejected_count',
      'reverted_count',
      'autonomous_since',
      'last_revert_at',
      'graduated_at',
      'updated_at',
    ],
  },
  {
    // Conversations is the parent of `messages` and `conversation_context`
    // (both FK with ON DELETE CASCADE); copying it first lets the
    // dependents satisfy their FK at insert time.
    table: 'conversations',
    idColumns: ['id'],
    columns: ['id', 'title', 'active_scopes', 'app_context', 'model', 'created_at', 'updated_at'],
  },
  {
    table: 'messages',
    idColumns: ['id'],
    columns: [
      'id',
      'conversation_id',
      'role',
      'content',
      'citations',
      'tool_calls',
      'tokens_in',
      'tokens_out',
      'created_at',
    ],
  },
  {
    // conversation_context's PK is the (conversation_id, engram_id) pair.
    // Filter on the composite tuple so new engram associations added to
    // an already-copied conversation still converge on subsequent boots.
    table: 'conversation_context',
    idColumns: ['conversation_id', 'engram_id'],
    columns: ['conversation_id', 'engram_id', 'relevance_score', 'loaded_at'],
  },
];

function tryCopyTable(raw: Database.Database, copy: TableCopy): void {
  try {
    const hasTable = raw
      .prepare(`SELECT 1 FROM pops.sqlite_master WHERE type='table' AND name='${copy.table}'`)
      .get();
    if (!hasTable) return;
    const cols = copy.columns.join(', ');
    const keyMatch = copy.idColumns
      .map((col) => `target.${col} = pops.${copy.table}.${col}`)
      .join(' AND ');
    raw.exec(`
      INSERT INTO ${copy.table} (${cols})
      SELECT ${cols}
      FROM pops.${copy.table}
      WHERE NOT EXISTS (
        SELECT 1 FROM ${copy.table} AS target WHERE ${keyMatch}
      )
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
