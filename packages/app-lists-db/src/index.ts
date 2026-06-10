/**
 * Backend-safe barrel for the lists domain's persistence layer (PRD-112).
 *
 * `@pops/app-lists-db` was split out of `@pops/app-lists` so the backend
 * (pops-api, food seed pipeline) can import services and schema without
 * pulling React-bound app code. Mirrors the `@pops/app-food-db` split.
 *
 * The frontend `@pops/app-lists` package re-exports from this one via its
 * `/db` subpath shim so existing imports keep resolving during the
 * migration. New backend consumers should import from `@pops/app-lists-db`
 * directly — the shim is only there for backward compatibility.
 */
export * from './errors.js';
export * from './schema.js';

// Drizzle handle type — re-exported so consumers don't have to reach
// into the internal services module.
export type { ListsDb } from './services/internal.js';

// Service namespaces — each module's free functions are exposed as a
// namespace so the API router code stays self-documenting at call sites.
export * as listsService from './services/lists.js';
export * as listItemsService from './services/list-items.js';

// Bare re-exports of the service modules' input/output types are kept
// flat so existing `import { CreateListInput } from '@pops/app-lists/db'`
// patterns continue to work through the shim.
export type { CreateListInput, ListListsFilter, UpdateListInput } from './services/lists.js';
export type { AddItemInput, UpdateItemInput } from './services/list-items.js';

// Backwards-compatible flat re-exports of the service free functions that
// HAVE NOT yet migrated to the canonical pillar packages. New code should
// prefer the namespace forms above (`listsService.createList`) — these flat
// re-exports keep the `/db` subpath shim a one-line passthrough during the
// migration window.
//
// Track K phase 1 PR 4: the `list_items` read + check-state surface
// (`listItemsForList`, `checkItem`, `uncheckItem`, `uncheckAllItems`) used
// to be flat-exported here but has been retired — every consumer flipped
// to `@pops/lists-db`'s `listItemsService.{listItemsForList, checkListItem,
// uncheckListItem, uncheckAllListItems}` in PR 3 (#2879). The
// implementations still live in `./services/list-items.js` because the
// remaining un-migrated mutations (`addItem`, `bulkAdd`, `updateItem`,
// `removeItem`, `reorderItems`, `removeCheckedItems`) share helper state
// with them and the package's own unit suite still exercises them — they
// get retired once subsequent slice PRs migrate the remaining mutations.
export {
  archiveList,
  createList,
  deleteList,
  getList,
  listLists,
  unarchiveList,
  updateList,
} from './services/lists.js';
export {
  addItem,
  bulkAdd,
  removeCheckedItems,
  removeItem,
  reorderItems,
  updateItem,
} from './services/list-items.js';
