import { resolveSqlitePath } from './sqlite-path.js';

/**
 * Boot-time backfill from the legacy shared `pops.db` into the core
 * pillar's `core.db`.
 *
 * Each slice cutover (Phase 2 PR 3 service-accounts, PRD-183 settings,
 * PRD-186 ai-usage, …) flips its handle to `getCoreDrizzle()`. The
 * first deploy after each cutover needs to carry the existing rows
 * from the shared DB across before any reads come from the new file.
 * Subsequent boots find the core copy already populated and become a
 * no-op via the `WHERE <id> NOT IN (...)` existence filter on every
 * table.
 *
 * Theme 13 round 2 retired the `service_accounts`, `settings`,
 * `ai_inference_daily`, and `ai_budgets` entries from `TABLE_COPIES`
 * — every write site for those tables now lands on `core.db` via
 * `getCoreDrizzle()`. `ai_inference_log` stays on the bridge because
 * `modules/food/routers/ai.ts` still writes to it via the shared
 * `getDrizzle()` handle (food-pillar PR 3 follow-up). Depends on the
 * settings + ai-usage + service-accounts PR 3 deploys having shipped
 * to prod before the retired entries are dropped; otherwise late
 * rows on `pops.db` would be stranded.
 *
 * No FK relationships exist between the listed core tables, so order
 * is independent — but each entry is wrapped in `tryCopyTable` so a
 * missing source table (post-PR-4 drop scenario, or a stale on-disk
 * pops.db) doesn't bring the whole backfill down. Failures are logged
 * + swallowed; the remaining tables still attempt.
 *
 * Non-fatal: ATTACH or INSERT failures are logged and swallowed so a
 * stale on-disk pops.db never bricks the boot path. Failures here
 * leave the core copy partially populated for that boot; the next
 * deploy retries and the idempotent filter picks up only the
 * still-missing rows.
 *
 * Mirrors `./backfill-finance-from-shared.ts` and `./media-backfill.ts`.
 */
import type Database from 'better-sqlite3';

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
    table: 'ai_inference_log',
    idColumn: 'id',
    columns: [
      'id',
      'provider',
      'model',
      'operation',
      'domain',
      'input_tokens',
      'output_tokens',
      'cost_usd',
      'latency_ms',
      'status',
      'cached',
      'context_id',
      'error_message',
      'metadata',
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
    console.warn(`[db] Core backfill of ${copy.table} failed (non-fatal):`, err);
  }
}

/**
 * Run the idempotent backfill against the open core SQLite handle. The
 * caller resolves the raw better-sqlite3 handle (typically
 * `getCoreDrizzle()`'s sibling `OpenedCoreDb.raw`) and passes it in so
 * this module stays decoupled from the singleton in `db.ts`.
 */
export function backfillCoreFromShared(coreRaw: Database.Database | null): void {
  if (!coreRaw) return;
  const sharedPath = resolveSqlitePath();
  try {
    coreRaw.prepare('ATTACH DATABASE ? AS pops').run(sharedPath);
    try {
      for (const copy of TABLE_COPIES) tryCopyTable(coreRaw, copy);
    } finally {
      coreRaw.exec('DETACH DATABASE pops');
    }
  } catch (err) {
    console.warn('[db] Core backfill ATTACH failed (non-fatal):', err);
  }
}
