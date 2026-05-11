/**
 * SQL loader for per-module migration declarations (PRD-101 US-09).
 *
 * Each module's manifest declares `backend.migrations: MigrationDescriptor[]`
 * with `{ id: drizzleTag, sql: <body> }` entries. Rather than inlining the
 * SQL into the manifest source (which would bloat the file with ~5KB of
 * raw text per migration), this helper reads the body from the drizzle
 * migrations directory at module-load time.
 *
 * Read cost is one synchronous fs read per declared migration during
 * backend startup — negligible (the runner already reads every entry to
 * compute hashes for `__drizzle_migrations`).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { DRIZZLE_MIGRATIONS_DIRECTORY } from './migrations-runner.js';

import type { MigrationDescriptor } from '@pops/types';

/**
 * Build a `MigrationDescriptor` from a drizzle migration tag, reading the
 * SQL body from `drizzle-migrations/<tag>.sql`. The body is captured at
 * call time — subsequent file edits will not be picked up until the
 * process restarts. This matches drizzle's own behaviour.
 */
export function drizzleMigration(tag: string): MigrationDescriptor {
  const sql = readFileSync(join(DRIZZLE_MIGRATIONS_DIRECTORY, `${tag}.sql`), 'utf8');
  return { id: tag, sql };
}

/**
 * Convenience wrapper — build descriptors for an ordered list of tags.
 */
export function drizzleMigrations(tags: readonly string[]): readonly MigrationDescriptor[] {
  return tags.map((tag) => drizzleMigration(tag));
}
