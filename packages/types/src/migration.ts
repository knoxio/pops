/**
 * Migration descriptor — per-module backend migration declaration (PRD-101 US-09).
 *
 * Today the migration runner walks a global folder and applies every file
 * unconditionally. After PRD-101 the runner consumes `MODULES.flatMap(m =>
 * m.backend?.migrations)` and skips migrations belonging to modules not in
 * the install set, so absent modules leave no rows in `schema_migrations`.
 *
 * The shape is intentionally minimal: `id` (the canonical version key written
 * to `schema_migrations`) plus `sql` (the migration body to execute). The
 * runner is responsible for ordering, idempotency, and transaction boundaries.
 */
export interface MigrationDescriptor {
  /**
   * Canonical migration version key, e.g. `2026_05_11_001_finance_init`.
   * Matches the value written to `schema_migrations.version`. MUST be stable
   * across releases — renaming is a breaking change for already-applied DBs.
   */
  id: string;
  /** SQL body of the migration. */
  sql: string;
}
