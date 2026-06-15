/**
 * Local re-export of lists-domain tables surfaced by `@pops/lists-db`.
 *
 * Canonical definitions live in `@pops/app-lists-db` per PRD-245 US-06
 * (audit H6/H7). Services in this package import from here for
 * ergonomics and so the lists pillar's read surface stays
 * self-describing.
 *
 * Phase 1 PR 1 ships only the `listItems` slice — the `lists` table itself
 * is referenced because the in-memory test suite needs to seed parent rows
 * before inserting children (the `list_items.list_id` FK is plain ON DELETE
 * NO ACTION, so there is no cascade — `deleteList` walks the children
 * explicitly in `@pops/app-lists-db`). The public list surface
 * (createList / listLists / archiveList / etc.) stays in `@pops/app-lists-db`
 * until the next slice PR moves it across.
 */
export { listItems, lists } from '@pops/app-lists-db';
export type {
  ListInsert,
  ListItemInsert,
  ListItemRefKind,
  ListItemRow,
  ListKind,
  ListRow,
} from '@pops/app-lists-db';
