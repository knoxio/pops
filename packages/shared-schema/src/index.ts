/**
 * Cross-pillar shared drizzle schema.
 *
 * Single source of truth for the schemas that more than one pillar
 * persists against: the `entities` table (owned by core, written by
 * finance) and the `ai_inference_log` table (owned by core, written by
 * food and the AI-ops slice). Extracted out of `@pops/core-db` per
 * PRD-245 US-07 (precursor C5) so finance/food no longer depend on
 * `@pops/core-db`.
 *
 * `@pops/core-db` and `pillars/core/src/db` re-export from here, so their
 * public barrels are unchanged.
 */
export { aiInferenceLog } from './ai-inference-log.js';
export { aiInferenceLogRowSchema } from './ai-inference-log-row-schemas.js';
export { entities } from './entities.js';
export { entitiesRowSchema } from './entities-row-schemas.js';
export { ENTITY_TYPES, type EntityType } from './entity-types.js';
