/**
 * Local re-export of food-domain tables surfaced by `@pops/food-db`.
 *
 * Canonical definitions live in `@pops/db-types/src/schema/*.ts` so the
 * drizzle-kit config (which globs `packages/db-types/src/schema/*`) picks
 * them up and the rest of the platform sees a single schema barrel.
 *
 * Services in this package import from here for ergonomics and so the
 * food pillar's read surface stays self-describing. Mirrors the
 * `@pops/core-db` / `@pops/inventory-db` / `@pops/media-db` / `@pops/finance-db`
 * schema re-export pattern.
 *
 * Phase 1 PR 1 ships only the `prepStates` row — additional tables get
 * surfaced here as subsequent slices land.
 */
export { prepStates } from '@pops/db-types';
export type { PrepStateInsert, PrepStateRow } from '@pops/db-types';
