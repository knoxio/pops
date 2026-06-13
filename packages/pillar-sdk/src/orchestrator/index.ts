/**
 * `@pops/pillar-sdk/orchestrator` — federated query orchestrator (PRD-197).
 *
 * Reads the discovery registry, fans the query out to every pillar's
 * search adapter (PRD-196), merges results via the cross-pillar ranking
 * strategy (PRD-198), and surfaces partial failures (PRD-199).
 */

export {
  runFederatedSearch,
  EmptyFederatedQueryError,
  DEFAULT_ADAPTER_TIMEOUT_MS,
} from './runner.js';
export type { FederatedSearchOptions, FederatedSearchResponse } from './runner.js';
export type {
  FederatedSearchQuery,
  FederatedSearchFailure,
  PillarAdapterTarget,
  SearchAdapterInvoker,
} from './types.js';
