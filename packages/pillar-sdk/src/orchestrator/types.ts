/**
 * Federated search orchestrator types (PRD-197).
 *
 * The orchestrator fans a single user query out to every registered pillar
 * whose manifest advertises at least one search adapter
 * (`manifest.search.adapters`), merges the per-pillar `ScoredResult[]`
 * lists via {@link mergeResults} (PRD-198), and returns a single ranked
 * response plus a per-pillar partial-failure list (PRD-197 `failures`) and
 * a per-pillar partial-failure summary block (PRD-199 `partial`).
 *
 * **Known limitation.** The manifest schema's `search.adapters` field now
 * carries the full PRD-196 descriptor (`name`, `entityType`, `queryShape`,
 * `procedurePath`, optional `rankFieldName`) and the orchestrator forwards
 * `procedurePath` to the invoker. The remaining gap is that the
 * orchestrator does not yet *use* `queryShape` to pre-filter targets:
 * every adapter is invoked unconditionally and is responsible for
 * returning `[]` if it cannot answer the requested dimensions
 * (text / tags / dateRange / scope). Wiring the pre-filter into
 * {@link runFederatedSearch} avoids paying the per-adapter parse-and-reject
 * cost.
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
 * One pillar's contribution to the fan-out. `pillarId` is a kebab-case
 * identifier (per the manifest schema's pillar id constraint);
 * `adapterName` is camelCase (PRD-196's manifest schema constraint on
 * `search.adapters`); `procedurePath` is the dotted tRPC path the
 * invoker should dispatch to (carried verbatim from the manifest so
 * invokers do not have to re-derive it from `pillarId`/`adapterName`).
 */
export interface PillarAdapterTarget {
  readonly pillarId: string;
  readonly adapterName: string;
  readonly procedurePath: string;
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
 * Targets carry the manifest's `procedurePath` directly, so invokers
 * can dispatch without independently resolving `(pillarId, adapterName)`
 * back to a path or duplicating registry state.
 */
export type SearchAdapterInvoker = (
  target: PillarAdapterTarget,
  query: FederatedSearchQuery,
  signal: AbortSignal
) => Promise<readonly ScoredResult[]>;

/**
 * Discriminated failure record reported per pillar+adapter pair when
 * fan-out fails — meaning the adapter promise rejected (including via
 * abort) or hit the per-adapter timeout. An adapter that resolves with
 * an empty `ScoredResult[]` is *not* a failure: empty is a valid
 * "nothing matched" answer and produces no record here. Contract
 * violations (non-array return values) are currently warned and
 * dropped without producing a failure record either; that should be
 * tightened as part of PRD-199 plumbing. The orchestrator emits one
 * record per failed target so PRD-199 partial-failure surfacing has
 * full context.
 */
export type FederatedSearchFailure =
  | { readonly pillarId: string; readonly adapterName: string; readonly reason: 'timeout' }
  | {
      readonly pillarId: string;
      readonly adapterName: string;
      readonly reason: 'error';
      readonly error: unknown;
    };
