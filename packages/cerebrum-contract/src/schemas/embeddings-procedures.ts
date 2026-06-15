import {
  EmbeddingsGetStatusInputSchema,
  EmbeddingsGetStatusOutputSchema,
  EmbeddingsListSourceIdsByTypeInputSchema,
  EmbeddingsListSourceIdsByTypeOutputSchema,
} from './embeddings.js';

/**
 * Procedure descriptors for the `cerebrum.embeddings.*` cross-pillar SDK
 * surface (PRD-249). The descriptors pin two things at the contract
 * boundary:
 *
 * 1. The tRPC method — both procedures are `query`. The router-side
 *    implementation (PRD-249 US-02) MUST register them via
 *    `t.procedure.query(...)` and never `t.procedure.mutation(...)`.
 * 2. The exact input / output zod schemas. The router's
 *    `.input(...) / .output(...)` calls MUST reference the same schema
 *    instances exported from `./embeddings.js`, so wire-format drift is
 *    a compile-time error.
 *
 * The descriptors are deliberately minimal — they do not carry handler
 * code, dependencies, or runtime references. They exist solely so a
 * future consumer can introspect the surface (e.g. for openapi-paths
 * generation) without re-deriving the method/method-shape mapping.
 */
export const embeddingsProcedures = {
  getStatus: {
    method: 'query',
    input: EmbeddingsGetStatusInputSchema,
    output: EmbeddingsGetStatusOutputSchema,
  },
  listSourceIdsByType: {
    method: 'query',
    input: EmbeddingsListSourceIdsByTypeInputSchema,
    output: EmbeddingsListSourceIdsByTypeOutputSchema,
  },
} as const;

/** Distinguishes the two `cerebrum.embeddings.*` procedure keys. */
export type EmbeddingsProcedureName = keyof typeof embeddingsProcedures;
