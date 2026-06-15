/**
 * Lists domain table barrel.
 *
 * Canonical definitions for lists-owned tables (`lists`, `list_items`) live
 * in this package per PRD-245 US-06 (audit H6/H7). `@pops/db-types`
 * re-exports these tables as a transition shim so legacy import sites keep
 * compiling until PRD-245 US-08 deletes the shim. Pillar consumers should
 * import from `@pops/app-lists-db` directly.
 */
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';

import type { listItems as listItemsTable, lists as listsTable } from './schema/lists.js';

export { listItems, lists } from './schema/lists.js';

export type ListRow = InferSelectModel<typeof listsTable>;
export type ListInsert = InferInsertModel<typeof listsTable>;
export type ListItemRow = InferSelectModel<typeof listItemsTable>;
export type ListItemInsert = InferInsertModel<typeof listItemsTable>;

export type ListKind = ListRow['kind'];
export type ListItemRefKind = ListItemRow['refKind'];
