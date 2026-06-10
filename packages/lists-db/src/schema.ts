/**
 * Local re-export of lists-domain tables surfaced by `@pops/lists-db`.
 *
 * Canonical definitions live in `@pops/db-types/src/schema/lists.ts` so the
 * drizzle-kit config (which globs `packages/db-types/src/schema/*`) picks
 * them up and the rest of the platform sees a single schema barrel.
 *
 * Services in this package import from here for ergonomics and so the
 * lists pillar's read surface stays self-describing. Mirrors the
 * `@pops/core-db` / `@pops/inventory-db` / `@pops/media-db` / `@pops/finance-db`
 * / `@pops/food-db` schema re-export pattern.
 *
 * Phase 1 PR 1 ships only the `listItems` slice — the `lists` table itself
 * is referenced because the in-memory test suite needs to seed parent rows
 * before inserting children (the `list_items.list_id` FK is plain ON DELETE
 * NO ACTION, so there is no cascade — `deleteList` walks the children
 * explicitly in `@pops/app-lists-db`). The public list surface
 * (createList / listLists / archiveList / etc.) stays in `@pops/app-lists-db`
 * until the next slice PR moves it across.
 */
export { listItems, lists } from '@pops/db-types';
export type {
  ListInsert,
  ListItemInsert,
  ListItemRefKind,
  ListItemRow,
  ListKind,
  ListRow,
} from '@pops/db-types';
