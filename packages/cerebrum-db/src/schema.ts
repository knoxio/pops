/**
 * Local re-export of cerebrum-domain tables.
 *
 * Canonical definitions live in `@pops/db-types/src/schema/*.ts` so the
 * drizzle-kit config (which globs `packages/db-types/src/schema/*`) picks
 * them up and the rest of the platform sees a single schema barrel.
 *
 * Services in this package import from here for ergonomics and so the
 * cerebrum pillar's read surface stays self-describing. Mirrors the
 * `@pops/core-db` / `@pops/inventory-db` schema re-export pattern.
 *
 * This first slice exposes only `nudgeLog` (PRD-084 reflex/nudge audit
 * trail). Downstream slices (engrams, embeddings, conversations,
 * glia_actions, plexus_adapters, plexus_filters) will add their tables
 * here as their service code lands.
 */
export { nudgeLog } from '@pops/db-types';
