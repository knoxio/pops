/**
 * Lists-domain inferred types.
 *
 * Re-exported from `./index.ts` for ergonomic consumer imports. Lives in a
 * sub-module to keep `index.ts` under the 200-line max-lines cap as more
 * domains accrete.
 *
 * Tables now live in `@pops/app-lists-db` (PRD-245 US-06 / audit H6).
 * See `docs/themes/07-food/prds/112-lists-schema/README.md` for the spec.
 */
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';

import type { listItems, lists } from '@pops/app-lists-db';

export type ListRow = InferSelectModel<typeof lists>;
export type ListInsert = InferInsertModel<typeof lists>;
export type ListItemRow = InferSelectModel<typeof listItems>;
export type ListItemInsert = InferInsertModel<typeof listItems>;

export type ListKind = ListRow['kind'];
export type ListItemRefKind = ListItemRow['refKind'];
