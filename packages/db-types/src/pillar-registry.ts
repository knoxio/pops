/**
 * Pillar-registry inferred types (Theme 13 PRD-161).
 *
 * Re-exported from `./index.ts` for ergonomic consumer imports. Lives
 * in a sub-module to keep `index.ts` under the 200-line max-lines cap
 * as more domains accrete.
 *
 * See `packages/db-types/src/schema/pillar-registry.ts` for the table
 * definition and `docs/themes/13-pillar-finale/prds/161-registry-schema-endpoints/`
 * for the spec.
 */
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';

import type { pillarRegistry } from './schema/pillar-registry.js';

export { pillarRegistry } from './schema/pillar-registry.js';

export type PillarRegistryRow = InferSelectModel<typeof pillarRegistry>;
export type PillarRegistryInsert = InferInsertModel<typeof pillarRegistry>;
