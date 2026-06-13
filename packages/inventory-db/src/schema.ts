/**
 * Local re-export of inventory-domain tables.
 *
 * Canonical definitions live in `@pops/db-types/src/schema/*.ts` so the
 * drizzle-kit config (which globs `packages/db-types/src/schema/*`) picks
 * them up and the rest of the platform sees a single schema barrel.
 *
 * Services in this package import from here for ergonomics and so the
 * inventory pillar's read surface stays self-describing. Mirrors the
 * `@pops/core-db` / `@pops/app-food-db` schema re-export pattern.
 *
 * `homeInventory` is included here even though the items service is not
 * yet extracted — the locations service reads from it for
 * `getLocationItems` / `getDeleteStats`, and downstream slice PRs (items,
 * connections, documents, photos, fixtures) will need it too.
 */
export { homeInventory, itemConnections, itemDocuments, locations } from '@pops/db-types';
