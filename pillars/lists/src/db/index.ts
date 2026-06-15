/**
 * Internal barrel for the lists pillar's persistence layer.
 *
 * PRIVATE to the pillar — never exported from `@pops/lists`'s public
 * surface. The `api/` subdir imports services and types from here via
 * relative paths.
 */
export * from './errors.js';
export * from './schema.js';

export type { ListsDb } from './services/internal.js';

export * as listsService from './services/lists.js';
export * as listItemsService from './services/list-items.js';

export type { CreateListInput, ListListsFilter, UpdateListInput } from './services/lists.js';
export type { AddItemInput, UpdateItemInput } from './services/list-items.js';

export { openListsDb, type OpenedListsDb } from './open-lists-db.js';
