/**
 * Boot-time backfill from the legacy shared `pops.db` into the inventory
 * pillar's `inventory.db`.
 *
 * Phase 2 PR 3 of the inventory pillar flipped locations + items +
 * fixtures + connections + documents + photos + uploaded-files +
 * fixture-connections traffic to the inventory handle. The first deploy
 * after each PR 3 needs to carry the existing rows from the shared DB
 * across before any reads come from the new file. Subsequent boots
 * find the inventory copy already populated and become a no-op via
 * the `WHERE id NOT IN (...)` existence filter on every table.
 *
 * Theme 13 retires the bridge slice-by-slice as each PR 3 deploy
 * ships. PR 4 drops the `locations` (pillar inventory phase 1 PR 3),
 * `item_connections` (PRD-175 PR 3), and `item_documents` (PRD-176 PR 3)
 * entries — their writers all land on `inventory.db` directly. The
 * remaining entries (`home_inventory`, `fixtures`, `item_photos`,
 * `item_uploaded_files`, `item_fixture_connections`) stay on the
 * bridge until PRD-173 PR 3 (the items + fixtures writer cutover)
 * ships and its PR 4 retires them as well.
 *
 * Order matters for FK enforcement (with `foreign_keys = ON`):
 *   home_inventory → fixtures → item_photos / item_uploaded_files /
 *   item_fixture_connections. `home_inventory.location_id` points
 *   at the locations row that already exists in `inventory.db`
 *   (locations was the first pillar slice to flip).
 *
 * Each table is wrapped in `tryCopyTable` so a missing source table
 * (post-PR-4 drop scenario, or a stale on-disk pops.db) doesn't bring
 * the whole backfill down. Failures are logged + swallowed; the
 * remaining tables still attempt.
 *
 * Non-fatal: ATTACH or INSERT failures are logged and swallowed so a
 * stale on-disk pops.db never bricks the boot path. Failures here
 * leave the inventory copy partially populated for that boot; the
 * next deploy retries and the idempotent filter picks up only the
 * still-missing rows.
 */
import type Database from 'better-sqlite3';

import type { OpenedInventoryDb } from '@pops/inventory-db';

interface TableCopy {
  readonly table: string;
  /** Explicit column list keeps the backfill robust against a stale
   * on-disk pops.db that already widened or narrowed since the boot
   * image was built. */
  readonly columns: readonly string[];
  /** Identifier column used in the existence filter. Every inventory
   * table on the bridge keys on `id` — the pair-table
   * `item_fixture_connections` keys on its autoincrement PK. */
  readonly idColumn: string;
}

const TABLE_COPIES: readonly TableCopy[] = [
  {
    table: 'home_inventory',
    idColumn: 'id',
    columns: [
      'id',
      'notion_id',
      'item_name',
      'brand',
      'model',
      'item_id',
      'room',
      'location',
      'type',
      'condition',
      'in_use',
      'deductible',
      'purchase_date',
      'warranty_expires',
      'replacement_value',
      'resale_value',
      'purchase_transaction_id',
      'purchased_from_id',
      'purchased_from_name',
      'purchase_price',
      'asset_id',
      'notes',
      'location_id',
      'created_at',
      'updated_at',
      'last_edited_time',
    ],
  },
  {
    table: 'fixtures',
    idColumn: 'id',
    columns: ['id', 'name', 'type', 'location_id', 'notes', 'created_at', 'last_edited_time'],
  },
  {
    table: 'item_photos',
    idColumn: 'id',
    columns: ['id', 'item_id', 'file_path', 'caption', 'sort_order', 'created_at'],
  },
  {
    table: 'item_uploaded_files',
    idColumn: 'id',
    columns: [
      'id',
      'item_id',
      'file_name',
      'file_path',
      'mime_type',
      'file_size',
      'uploaded_at',
      'created_at',
    ],
  },
  {
    table: 'item_fixture_connections',
    idColumn: 'id',
    columns: ['id', 'item_id', 'fixture_id', 'created_at'],
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
    console.warn(`[db] Inventory backfill of ${copy.table} failed (non-fatal):`, err);
  }
}

/**
 * Copy every inventory-owned table's rows from `pops.db` into
 * `inventory.db`, in FK-safe order, idempotent against re-runs.
 *
 * Caller is responsible for supplying the inventory handle (so this
 * module stays decoupled from the lazy singleton in
 * `db/inventory-handle.ts`). Production wiring passes the result of
 * `getInventoryDrizzle()` after the eager-open block; tests pass an
 * in-memory handle with a tmpdir copy of the shared DB pre-populated.
 */
export function backfillInventoryFromShared(
  inventory: OpenedInventoryDb,
  sharedPath: string
): void {
  try {
    inventory.raw.prepare('ATTACH DATABASE ? AS pops').run(sharedPath);
    try {
      for (const copy of TABLE_COPIES) tryCopyTable(inventory.raw, copy);
    } finally {
      inventory.raw.exec('DETACH DATABASE pops');
    }
  } catch (err) {
    console.warn('[db] Inventory backfill ATTACH failed (non-fatal):', err);
  }
}
