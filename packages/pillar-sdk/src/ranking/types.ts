/**
 * Shared types for the cross-pillar ranking strategy (PRD-198).
 *
 * The federated search orchestrator (PRD-197) fans a query out to every
 * registered pillar adapter (PRD-196), collects per-pillar `ScoredResult[]`
 * lists, then hands them to `mergeResults` for cross-pillar ranking.
 */

/**
 * A single search hit returned by a pillar adapter. The shape is intentionally
 * minimal — the orchestrator does not need to understand pillar-specific
 * payloads to rank them, only the score and a stable name for fallback
 * ordering.
 */
export interface ScoredResult {
  /**
   * Raw relevance score returned by the owning pillar's adapter. Scale is
   * pillar-defined; the merge step normalises per-pillar so adapters are free
   * to use whatever range they like.
   */
  readonly score: number;
  /**
   * Stable entity name used as the alphabetical tie-breaker when every result
   * in the merge set has score 0.
   */
  readonly entityName: string;
  /**
   * Arbitrary payload forwarded to the caller untouched. Type is unknown
   * because each pillar returns a different shape; the orchestrator (PRD-197)
   * is responsible for typing the consumer-facing union.
   */
  readonly data: unknown;
}

/**
 * The merged result carries the pillar id alongside the original payload so
 * the caller can section results, attribute hits, and recover the adapter
 * that produced each row.
 */
export interface MergedResult extends ScoredResult {
  /** Pillar id the result came from — matches a key of the input map. */
  readonly pillarId: string;
  /**
   * Adjusted score after per-pillar normalisation + weight application. Kept
   * for transparency (debugging / UI tooltips). Always in `[0, 1 * weight]`.
   */
  readonly adjustedScore: number;
}

/**
 * Per-pillar weights, typically sourced from `core.db.settings` under
 * `search.pillarWeights.<pillarId>`. A pillar not present in the map gets the
 * default weight (1.0). Negative weights are treated as 0; non-finite weights
 * (`NaN`, `±Infinity`) fall back to the default weight. Both cases emit a
 * warning through `MergeOptions.onWarn` (see `mergeResults`).
 */
export type PillarWeights = ReadonlyMap<string, number>;

export interface MergeOptions {
  /**
   * Optional cap on the number of results returned. When omitted, all merged
   * results are returned in ranked order. Negative or non-finite limits are
   * treated as 0 (no `slice(0, -1)` "all but the last" surprise); fractional
   * limits are floored.
   */
  readonly limit?: number;
  /**
   * Per-pillar weight overrides. Missing entries default to
   * `DEFAULT_PILLAR_WEIGHT` (1.0).
   */
  readonly weights?: PillarWeights;
  /**
   * Sink for misconfiguration warnings (e.g. negative or non-finite weights).
   * Defaults to a no-op so `mergeResults` stays a pure function with no I/O —
   * callers that care about warnings (the orchestrator in PRD-197, tests) must
   * inject their own logger / spy.
   */
  readonly onWarn?: (message: string) => void;
}
