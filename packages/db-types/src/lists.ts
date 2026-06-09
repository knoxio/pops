/**
 * Lists-domain inferred types.
 *
 * Re-exported from `./index.ts` for ergonomic consumer imports. Lives in a
 * sub-module to keep `index.ts` under the 200-line max-lines cap as more
 * domains accrete.
 *
 * See `packages/db-types/src/schema/lists.ts` for the table definitions and
 * `docs/themes/07-food/prds/112-lists-schema/README.md` for the spec.
 */
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';

import type { listItems, lists } from './schema/lists.js';

export type ListRow = InferSelectModel<typeof lists>;
export type ListInsert = InferInsertModel<typeof lists>;
export type ListItemRow = InferSelectModel<typeof listItems>;
export type ListItemInsert = InferInsertModel<typeof listItems>;

export type ListKind = ListRow['kind'];
export type ListItemRefKind = ListItemRow['refKind'];
