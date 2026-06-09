/**
 * Per-pillar drizzle-kit config builder (pillar-migration P1).
 *
 * Background: pre-pillar, every domain's schema lives in a shared
 * `packages/db-types/src/schema/**` and emits to a single
 * `apps/pops-api/src/db/drizzle-migrations/` journal. ADR-026 splits each
 * domain into its own `packages/<id>-db/` package with its own schema files,
 * its own migrations dir, and its own journal — so `drizzle-kit generate`
 * for the `core` pillar never has to look at `food`'s schema, and the
 * runtime migration runner can apply each pillar's journal independently.
 *
 * This module is the single source of truth for *how* a drizzle config is
 * shaped. Each pillar's eventual `packages/<id>-db/drizzle.config.ts`
 * imports `buildPillarDrizzleConfig` and supplies its pillar id + paths.
 * The existing shared config (`apps/pops-api/drizzle.config.ts`) calls it
 * too, with the legacy `<repo>/packages/db-types/src/schema/**` glob and
 * the legacy `<repo>/apps/pops-api/src/db/drizzle-migrations` out dir, so
 * the operator-facing `mise drizzle:generate` behaviour is unchanged.
 *
 * The function is pure (no I/O, no env reads of its own except the SQLite
 * path), so unit-testable by importing it directly.
 *
 * @see .claude/pillar-migration-roadmap.md (P1)
 */
import { defineConfig } from 'drizzle-kit';

/**
 * Narrower return type than drizzle-kit's `Config` discriminated union, so
 * callers (and tests) can read `dbCredentials.url` without re-discriminating
 * the union by `dialect`. drizzle-kit's runtime only inspects shape, so
 * this is a legitimate subtype rather than a cast.
 */
export interface PillarDrizzleConfig {
  readonly dialect: 'sqlite';
  readonly schema: string;
  readonly out: string;
  readonly dbCredentials: { readonly url: string };
}

/** Inputs accepted by {@link buildPillarDrizzleConfig}. */
export interface PillarDrizzleConfigInputs {
  /**
   * Pillar id matching `KNOWN_PILLARS[i].id` (e.g. `'core'`, `'food'`).
   * Recorded in the resulting config's `tablesFilter` for future operator
   * tooling that inspects the config (e.g. drizzle-studio per-pillar mode);
   * not enforced by drizzle-kit itself today.
   */
  pillarId: string;
  /**
   * Glob (relative to the consuming config file's directory) pointing at
   * the pillar's schema files. Pillar-owned schemas live in
   * `packages/<pillarId>-db/src/schema/**\/*.ts`; the legacy shared
   * config uses `../../packages/db-types/src/schema/*`.
   */
  schemaGlob: string;
  /**
   * Output directory (relative to the consuming config file) for generated
   * migrations + journal. Pillar-owned dirs are
   * `packages/<pillarId>-db/migrations`; the legacy shared dir is
   * `./src/db/drizzle-migrations`.
   */
  outDir: string;
  /**
   * Optional override for the SQLite path drizzle-kit connects to (e.g.
   * for `drizzle-kit studio`). Defaults to `process.env.SQLITE_PATH` then
   * the per-pillar `./data/<pillarId>.db` (per ADR-026's per-pillar SQLite
   * decision) — falling back to `./data/pops.db` when the legacy shared
   * config is in use.
   */
  sqlitePathOverride?: string;
}

/**
 * Pillars get one SQLite per ADR-026; the legacy shared config still
 * points at `pops.db`. The builder picks the per-pillar path only when no
 * override is supplied AND the pillar id isn't the sentinel `'shared'`.
 */
function resolveSqliteUrl(pillarId: string, override: string | undefined): string {
  if (override !== undefined) return override;
  const fromEnv = process.env['SQLITE_PATH'];
  if (fromEnv !== undefined && fromEnv.length > 0) return fromEnv;
  if (pillarId === 'shared') return './data/pops.db';
  return `./data/${pillarId}.db`;
}

/**
 * Build a drizzle-kit `Config` for one pillar.
 *
 * Each pillar's `packages/<id>-db/drizzle.config.ts` is a one-liner. The
 * helper is exposed from `@pops/api` under the `./drizzle-config-builder`
 * subpath (see `apps/pops-api/package.json#exports`), so a pillar `-db`
 * package can import it as a workspace dep:
 *
 * ```ts
 * import { buildPillarDrizzleConfig } from '@pops/api/drizzle-config-builder';
 * export default buildPillarDrizzleConfig({
 *   pillarId: 'core',
 *   schemaGlob: './src/schema/**\/*.ts',
 *   outDir: './migrations',
 * });
 * ```
 *
 * Until the per-pillar `-db` packages land, the legacy shared config in
 * `apps/pops-api/drizzle.config.ts` uses pillarId `'shared'` and the
 * existing schema/out paths.
 */
export function buildPillarDrizzleConfig(inputs: PillarDrizzleConfigInputs): PillarDrizzleConfig {
  const { pillarId, schemaGlob, outDir, sqlitePathOverride } = inputs;
  const config: PillarDrizzleConfig = {
    dialect: 'sqlite',
    schema: schemaGlob,
    out: outDir,
    dbCredentials: { url: resolveSqliteUrl(pillarId, sqlitePathOverride) },
  };
  // Pass through drizzle-kit's identity validator so any future runtime
  // checks it adds fire here too.
  defineConfig(config);
  return config;
}
