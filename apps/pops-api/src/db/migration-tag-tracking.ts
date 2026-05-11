/**
 * Tag-keyed migration tracking — sister table to `__drizzle_migrations`.
 *
 * `__drizzle_migrations` records applied migrations by SQL hash, which is
 * fine for first-time apply but breaks down if a migration file is edited
 * after-the-fact: a different hash makes the runner re-attempt the
 * migration, and one-way statements (e.g. `UPDATE … SET new_col = old_col`
 * after a rename) crash on the now-missing column. The remedy is to also
 * record the tag — the file name minus extension — so the runner can
 * detect "tag matches, hash drifted" and skip the re-run.
 *
 * Issue #2610 has the full incident write-up.
 */
import type BetterSqlite3 from 'better-sqlite3';

export function ensureAppliedTagsTable(db: BetterSqlite3.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS "__pops_migration_tags" (
      tag TEXT PRIMARY KEY,
      hash TEXT NOT NULL,
      applied_at INTEGER NOT NULL
    )
  `);
}

export function appliedTags(db: BetterSqlite3.Database): Map<string, string> {
  const rows = db.prepare('SELECT tag, hash FROM __pops_migration_tags').all() as {
    tag: string;
    hash: string;
  }[];
  return new Map(rows.map((r) => [r.tag, r.hash]));
}
