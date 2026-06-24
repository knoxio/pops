/**
 * Lists domain table barrel.
 *
 * Canonical definitions for lists-owned tables (`lists`, `list_items`) live
 * in this pillar (see pillars/lists/docs/prds/schema).
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
