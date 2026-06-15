import { z } from 'zod';

/**
 * Input shape for `cerebrum.embeddings.getStatus`.
 *
 * `sourceType` is optional — when omitted, the procedure returns coverage
 * stats across every source type tracked in the cerebrum `embeddings`
 * table. When provided, the response is scoped to that source type.
 *
 * Read-only procedure; consumed as a tRPC query (not a mutation).
 */
export const EmbeddingsGetStatusInputSchema = z.object({
  sourceType: z.string().min(1).optional(),
});

/**
 * Output shape for `cerebrum.embeddings.getStatus`.
 *
 * `total` is the number of embedded rows (optionally filtered by
 * `sourceType`). `pending` and `stale` are reserved placeholders held at
 * `0` for forward-compatibility — they reflect the in-monolith call site
 * note (`apps/pops-api/src/modules/core/embeddings/service.ts:128`) that
 * per-source pending/stale tracking is out of scope for the current
 * surface. A successor PRD wires real counts when a consumer needs them.
 */
export const EmbeddingsGetStatusOutputSchema = z.object({
  total: z.number().int().min(0),
  pending: z.number().int().min(0),
  stale: z.number().int().min(0),
});

/**
 * Input shape for `cerebrum.embeddings.listSourceIdsByType`.
 *
 * `sourceType` is required — the procedure enumerates the distinct
 * `sourceId`s recorded against that exact source type. Mirrors the
 * `selectDistinct({ sourceId }).from(embeddings).where(eq(embeddings.sourceType, ...))`
 * shape that the consumer (`core/embeddings/service.ts` `reindexEmbeddings`)
 * uses today.
 *
 * Read-only procedure; consumed as a tRPC query (not a mutation).
 */
export const EmbeddingsListSourceIdsByTypeInputSchema = z.object({
  sourceType: z.string().min(1),
});

/**
 * Output shape for `cerebrum.embeddings.listSourceIdsByType`.
 *
 * `sourceIds` is the distinct list of source identifiers for the given
 * source type. Order is unspecified — callers do not assume sorted
 * output (mirrors `selectDistinct` semantics). The list is unbounded by
 * design at this surface; a successor PRD adds `{ limit?, cursor? }`
 * pagination if the table grows large enough that wire-payload size
 * becomes a concern.
 */
export const EmbeddingsListSourceIdsByTypeOutputSchema = z.object({
  sourceIds: z.array(z.string()).readonly(),
});
