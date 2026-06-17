/**
 * Public types for the cerebrum `embeddings.*` cross-pillar SDK surface.
 *
 * Two read-only procedures live on this surface — `getStatus` and
 * `listSourceIdsByType` — both consumed by
 * `apps/pops-api/src/modules/core/embeddings/service.ts` once US-02 flips
 * the call site. Both are tRPC queries; neither mutates state.
 *
 * The schemas under `../schemas/embeddings.ts` are the source of truth
 * for runtime validation; these interfaces mirror the inferred shapes
 * and exist so that consumers can import the type without pulling zod.
 * A round-trip test enforces structural agreement.
 */

/** Input for `cerebrum.embeddings.getStatus`. */
export interface EmbeddingsGetStatusInput {
  /**
   * Optional source-type filter. When omitted, the procedure returns the
   * coverage stats across every source type tracked in the cerebrum
   * `embeddings` table.
   */
  sourceType?: string;
}

/** Output for `cerebrum.embeddings.getStatus`. */
export interface EmbeddingsGetStatusOutput {
  /** Total embedded rows (optionally scoped to `input.sourceType`). */
  total: number;
  /**
   * Placeholder, always `0` today. Reserved for forward-compatibility —
   * a successor PRD wires real per-source pending counts when a consumer
   * needs them. Mirrors the in-monolith note at
   * `apps/pops-api/src/modules/core/embeddings/service.ts:128`.
   */
  pending: number;
  /**
   * Placeholder, always `0` today. Reserved for forward-compatibility —
   * see `pending`.
   */
  stale: number;
}

/** Input for `cerebrum.embeddings.listSourceIdsByType`. */
export interface EmbeddingsListSourceIdsByTypeInput {
  /** Required source-type filter (e.g. `'engram'`, `'nudge'`). */
  sourceType: string;
}

/** Output for `cerebrum.embeddings.listSourceIdsByType`. */
export interface EmbeddingsListSourceIdsByTypeOutput {
  /**
   * Distinct `sourceId`s recorded against `input.sourceType`. Order is
   * unspecified — callers do not assume sorted output. Unbounded at this
   * surface; future pagination is opt-in via a successor PRD.
   */
  sourceIds: readonly string[];
}
