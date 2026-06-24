import {
  EmbeddingsGetStatusInputSchema,
  EmbeddingsGetStatusOutputSchema,
  EmbeddingsListSourceIdsByTypeInputSchema,
  EmbeddingsListSourceIdsByTypeOutputSchema,
} from './embeddings.js';

/**
 * Read-only introspection descriptors for the `cerebrum.embeddings.*`
 * cross-pillar surface. The serving contract is the ts-rest router in
 * `../rest-embeddings.ts` (both endpoints are POST-with-body); these
 * descriptors pin the input / output zod instances to the same schemas
 * exported from `./embeddings.js`, so wire-format drift is a compile-time
 * error. The `method: 'query'` tag marks both as read-only — no writes
 * cross this boundary.
 *
 * Deliberately minimal: no handler code, dependencies, or runtime
 * references. They exist so a consumer can introspect the surface without
 * re-deriving the method / shape mapping.
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

/** The two `cerebrum.embeddings.*` procedure keys. */
export type EmbeddingsProcedureName = keyof typeof embeddingsProcedures;
