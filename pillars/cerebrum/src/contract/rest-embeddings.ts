/**
 * ts-rest contract for `cerebrum.embeddings.*`.
 *
 * Read-only cross-pillar surface over the `embeddings` metadata table:
 *
 *   - `getStatus`            → POST /embeddings/status      → coverage stats
 *   - `listSourceIdsByType`  → POST /embeddings/source-ids  → distinct ids
 *
 * `pending` / `stale` are held at `0` — per-source tracking is out of scope for
 * the current surface. Writes to `embeddings` belong to the cerebrum-internal
 * embedding worker, not cross-pillar callers.
 *
 * Both procedures are POST-with-body rather than GET: the typed inputs avoid
 * query-string round-tripping. Non-identity domain — docker-network trust, no
 * per-request auth (parity with templates / nudges). The wire schemas are
 * defined locally so the pillar contract stays self-contained.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

const c = initContract();

export const embeddingsStatusSchema = z.object({
  total: z.number().int().min(0),
  pending: z.number().int().min(0),
  stale: z.number().int().min(0),
});
export type EmbeddingsStatusWire = z.infer<typeof embeddingsStatusSchema>;

export const embeddingsSourceIdsSchema = z.object({
  sourceIds: z.array(z.string()),
});
export type EmbeddingsSourceIdsWire = z.infer<typeof embeddingsSourceIdsSchema>;

export const cerebrumEmbeddingsContract = c.router({
  getStatus: {
    method: 'POST',
    path: '/embeddings/status',
    summary: 'Embedded-row coverage stats, optionally scoped to a source type.',
    body: z.object({ sourceType: z.string().min(1).optional() }),
    responses: {
      200: embeddingsStatusSchema,
    },
  },
  listSourceIdsByType: {
    method: 'POST',
    path: '/embeddings/source-ids',
    summary: 'Distinct source ids recorded against a given source type.',
    body: z.object({ sourceType: z.string().min(1) }),
    responses: {
      200: embeddingsSourceIdsSchema,
    },
  },
});
