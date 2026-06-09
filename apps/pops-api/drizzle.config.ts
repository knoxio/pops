/**
 * Drizzle Kit configuration for POPS API — legacy shared journal.
 *
 * This is the **transitional** config that survives until every pillar's
 * schemas + journal have moved into their respective
 * `packages/<id>-db/` packages (per the per-pillar migration tracked in
 * `.claude/pillar-migration-roadmap.md`). It points at the historical
 * shared schema glob and out dir, so `mise drizzle:generate` behaves
 * exactly as it did before P1 landed.
 *
 * A per-pillar config (next to each `packages/<id>-db/`) is built with the
 * same helper — see `./src/db/drizzle-config-builder.ts` for the contract.
 *
 * Migration workflow (unchanged):
 *   1. Edit schema files in `packages/db-types/src/schema/`
 *   2. Run `mise drizzle:generate` (or `pnpm exec drizzle-kit generate`)
 *   3. Review the generated SQL in `src/db/drizzle-migrations/`
 *   4. Run `mise drizzle:migrate` to apply (or `pnpm exec drizzle-kit migrate`)
 *
 * Note: The baseline migration (0000_*) captures the full schema as of E06.
 * Existing production databases already have this schema applied via the
 * incremental SQL migrations in src/db/migrations/. Do NOT re-apply the
 * baseline to an existing prod DB — it will conflict.
 */
import { buildPillarDrizzleConfig } from './src/db/drizzle-config-builder.js';

export default buildPillarDrizzleConfig({
  pillarId: 'shared',
  schemaGlob: '../../packages/db-types/src/schema/*',
  outDir: './src/db/drizzle-migrations',
});
