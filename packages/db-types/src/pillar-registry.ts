/**
 * Pillar-registry inferred types (Theme 13 PRD-161).
 *
 * Re-exported from `./index.ts` for ergonomic consumer imports. Lives
 * in a sub-module to keep `index.ts` under the 200-line max-lines cap
 * as more domains accrete.
 *
 * The `pillar_registry` drizzle table relocated from `@pops/db-types`
 * to `@pops/core-db` per PRD-245 US-07.
 */
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';

import type { pillarRegistry } from '@pops/core-db';

export { pillarRegistry } from '@pops/core-db';

export type PillarRegistryRow = InferSelectModel<typeof pillarRegistry>;
export type PillarRegistryInsert = InferInsertModel<typeof pillarRegistry>;
