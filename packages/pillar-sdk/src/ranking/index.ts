/**
 * `@pops/pillar-sdk/ranking` — cross-pillar ranking strategy (PRD-198).
 *
 * Used by the federated search orchestrator (PRD-197) to merge `ScoredResult`
 * lists from each pillar adapter (PRD-196) into a single ranked response.
 */

export type { ScoredResult, MergedResult, PillarWeights, MergeOptions } from './types.js';
export {
  mergeResults,
  pillarWeightSettingKey,
  DEFAULT_PILLAR_WEIGHT,
  SETTINGS_KEY_PREFIX,
} from './merge.js';
