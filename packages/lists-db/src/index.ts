/**
 * Backend-safe barrel for the lists domain's persistence layer.
 *
 * Hosts lists pillar tables (Phase 1 PR 1 surfaces the `list_items` read /
 * check slice; the remaining slices — full `lists` CRUD, item create /
 * update / bulk-add / reorder / remove, the PRD-141 shopping specialisation
 * — follow in subsequent slice PRs). The package is the canonical
 * `@pops/lists-db` and mirrors the per-pillar shape adopted across
 * `@pops/core-db`, `@pops/finance-db`, `@pops/inventory-db`,
 * `@pops/media-db`, `@pops/cerebrum-db`, and `@pops/food-db`.
 *
 * Per ADR-026 and `.claude/pillar-migration-roadmap.md`, the lists pillar
 * pre-existed as `@pops/app-lists-db` (extracted in PRD-140 part API
 * #2725). This new package is the canonical name going forward; the older
 * `@pops/app-lists-db` is left in place during the Phase 1 transition
 * and gets converted to a re-export shim in PR 4 once every consumer has
 * been flipped.
 *
 * Per the CI-never-breaks pattern the migration is incremental — this PR
 * scaffolds the package and surfaces only the `list_items` read / check
 * slice. `@pops/app-lists-db` continues to expose every list + list-item
 * service unchanged; this barrel is purely additive.
 */
export * from './errors.js';
export * from './schema.js';

export type { ListsDb } from './services/internal.js';

export * as listItemsService from './services/list-items.js';

export { openListsDb, type OpenedListsDb } from './open-lists-db.js';
