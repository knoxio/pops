/**
 * Federated search orchestrator types (PRD-197).
 *
 * The orchestrator fans a single user query out to every registered pillar
 * whose manifest advertises at least one search adapter
 * (`manifest.search.adapters`), merges the per-pillar `ScoredResult[]`
 * lists via {@link mergeResults} (PRD-198), and returns a single ranked
 * response plus a per-pillar partial-failure list (PRD-199).
 *
 * **Known limitation (interim shape).** As of this PRD-197 cut, the
 * manifest schema's `search.adapters` field is `readonly string[]` —
 * adapter names only. PRD-196's richer descriptor (`procedurePath`,
 * `queryShape`, `entityType`, `rankFieldName`) has not landed. Until it
 * does, the orchestrator cannot reject queries against an adapter that
 * does not advertise the requested dimensions (text / tags / dateRange /
 * scope) — every adapter is invoked unconditionally and is responsible
 * for returning `[]` if the query is unsupported. When PRD-196 lands,
 * the pre-filter belongs in {@link runFederatedSearch} so each adapter
 * does not pay the parse-and-reject cost.
 *
 * Dispatch is delegated to a {@link SearchAdapterInvoker} so the
 * orchestrator does not need to know how the underlying procedure is
 * named or transported.
 */

import type { ScoredResult } from '../ranking/types.js';

/**
 * The free-form query the orchestrator forwards to each adapter. The
 * orchestrator does not interpret the body of the query — it only
 * enforces PRD-197's "empty queries are rejected with 400" by requiring
 * at least one of `text`, `tags`, or `dateRange` to be non-empty.
 */
export interface FederatedSearchQuery {
  readonly text?: string;
  readonly tags?: readonly string[];
  readonly dateRange?: { readonly from: Date; readonly to: Date };
  /**
   * Additional scope filters keyed by adapter-defined keys; forwarded
   * untouched to each adapter. Validation (which keys an adapter
   * accepts) becomes the orchestrator's job once PRD-196 lands.
   */
  readonly scope?: Readonly<Record<string, string>>;
  /**
   * Optional pillar id allow-list. When set, only pillars in this list
   * are queried — others are skipped (not reported as failures).
   */
  readonly pillars?: readonly string[];
  /**
   * Optional cap on merged result count. Forwarded to
   * {@link mergeResults} as `MergeOptions.limit`.
   */
  readonly limit?: number;
}

/**
 * One pillar's contribution to the fan-out. Both ids are camelCase
 * identifiers (PRD-196's manifest schema constraint on `adapters`).
 */
export interface PillarAdapterTarget {
  readonly pillarId: string;
  readonly adapterName: string;
}

/**
 * Invoker contract: given a target adapter and the query, return that
 * adapter's `ScoredResult[]`. The `signal` is wired to the per-adapter
 * timeout so callers can short-circuit slow HTTP calls.
 *
 * Implementations live outside the orchestrator package so the
 * dispatch detail (HTTP via the `pillar()` SDK, in-process, mock) is
 * swappable. The orchestrator only requires that rejecting the
 * returned promise — including via abort — is treated as a failure.
 *
 * In production the invoker is expected to resolve `(pillarId,
 * adapterName)` to a procedure path. The current `search.adapters`
 * shape (PRD-197 interim — adapter names only) does not carry the
 * path itself; until PRD-196 lands, callers compose it by convention
 * (e.g. `${pillarId}.${adapterName}.search`).
 */
export type SearchAdapterInvoker = (
  target: PillarAdapterTarget,
  query: FederatedSearchQuery,
  signal: AbortSignal
) => Promise<readonly ScoredResult[]>;

/**
 * Discriminated failure record reported per pillar+adapter pair when
 * fan-out does not yield results. The orchestrator emits one record per
 * failed target so PRD-199 partial-failure surfacing has full context.
 */
export type FederatedSearchFailure =
  | { readonly pillarId: string; readonly adapterName: string; readonly reason: 'timeout' }
  | {
      readonly pillarId: string;
      readonly adapterName: string;
      readonly reason: 'error';
      readonly error: unknown;
    };
