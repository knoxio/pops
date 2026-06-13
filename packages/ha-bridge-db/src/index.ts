/**
 * Backend-safe barrel for the HA bridge pillar's persistence layer.
 *
 * The HA bridge is the first "bridge pillar" per ADR-032 / PRD-229 — its
 * source of truth is upstream (Home Assistant), not user-entered data.
 * The schema is defined locally rather than in `@pops/db-types` because
 * no other pillar reads these tables directly; consumers reach the data
 * through the bridge's tRPC surface, its `searchAdapter`, and its AI
 * tools (US-02 / US-03 / US-04).
 */
export {
  haEntities,
  haStateHistory,
  type HaEntityInsert,
  type HaEntityRow,
  type HaStateHistoryInsert,
  type HaStateHistoryRow,
} from './schema.js';

export type { HaBridgeDb } from './services/internal.js';

export { openHaBridgeDb, type OpenedHaBridgeDb } from './open-ha-bridge-db.js';

export * as entitiesService from './services/entities.js';
export {
  appendHistory,
  getEntity,
  pruneHistory,
  upsertEntity,
  type HaEntityMirrorInput,
} from './services/entities.js';

export {
  searchEntities,
  type HaEntitySearchHit,
  type HaEntitySearchOptions,
} from './services/search.js';

export {
  listEntities,
  type ListEntitiesOptions,
  type ListEntitiesResult,
} from './services/list.js';
