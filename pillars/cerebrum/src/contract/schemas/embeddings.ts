import { z } from 'zod';

/**
 * Input shape for `cerebrum.embeddings.getStatus`.
 *
 * `sourceType` is optional — when omitted, the procedure returns coverage
 * stats across every source type tracked in the cerebrum `embeddings`
 * table. When provided, the response is scoped to that source type.
 *
 * Read-only surface.
 */
export const EmbeddingsGetStatusInputSchema = z.object({
  sourceType: z.string().min(1).optional(),
});

/**
 * Output shape for `cerebrum.embeddings.getStatus`.
 *
 * `total` is the number of embedded rows (optionally filtered by
 * `sourceType`). `pending` and `stale` are held at `0`: per-source
 * pending/stale tracking is out of scope for this surface (see
 * `../../api/modules/embeddings/service.ts`).
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
 * shape in `../../api/modules/embeddings/service.ts`.
 *
 * Read-only surface.
 */
export const EmbeddingsListSourceIdsByTypeInputSchema = z.object({
  sourceType: z.string().min(1),
});

/**
 * Output shape for `cerebrum.embeddings.listSourceIdsByType`.
 *
 * `sourceIds` is the distinct list of source identifiers for the given
 * source type. Order is unspecified — callers do not assume sorted
 * output (mirrors `selectDistinct` semantics). The list is unbounded at
 * this surface; there is no pagination.
 */
export const EmbeddingsListSourceIdsByTypeOutputSchema = z.object({
  sourceIds: z.array(z.string()).readonly(),
});
