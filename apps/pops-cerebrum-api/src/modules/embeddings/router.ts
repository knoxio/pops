/**
 * Read-only `cerebrum.embeddings.*` cross-pillar SDK surface (PRD-249 US-02).
 *
 * Mounts the two procedures consumed by
 * `apps/pops-api/src/modules/core/embeddings/service.ts` once it flips
 * off its direct `@pops/cerebrum-db` runtime import (PRD-249 US-03):
 *
 *   - `getStatus({ sourceType? })` — total embedded count, optionally
 *     filtered by source type. `pending` / `stale` stay at `0` to mirror
 *     today's `service.ts:128` note about per-source tracking being out
 *     of scope for the current surface.
 *   - `listSourceIdsByType({ sourceType })` — distinct source ids for a
 *     given source type (the `selectDistinct(...)` path the consumer
 *     `reindexEmbeddings` uses when no explicit id list is passed).
 *
 * Both procedures bind the zod schemas pinned in
 * `@pops/cerebrum-contract/schemas` (PRD-249 US-01) so the router and
 * the typed `pillar('cerebrum').embeddings.*` proxy agree on the wire
 * format without re-deriving the shapes.
 *
 * Read-only by design — writes to the `embeddings` table are owned by
 * the cerebrum-internal embedding worker; cross-pillar callers have no
 * business writing.
 */
import { eq, sql } from 'drizzle-orm';

import {
  EmbeddingsGetStatusInputSchema,
  EmbeddingsGetStatusOutputSchema,
  EmbeddingsListSourceIdsByTypeInputSchema,
  EmbeddingsListSourceIdsByTypeOutputSchema,
} from '@pops/cerebrum-contract/schemas';
import { embeddings } from '@pops/cerebrum-db';

import { protectedProcedure, router } from '../../trpc.js';

export const embeddingsRouter = router({
  getStatus: protectedProcedure
    .input(EmbeddingsGetStatusInputSchema)
    .output(EmbeddingsGetStatusOutputSchema)
    .query(({ input, ctx }) => {
      const baseQuery = ctx.cerebrumDb.select({ count: sql<number>`count(*)` }).from(embeddings);
      const rows = input.sourceType
        ? baseQuery.where(eq(embeddings.sourceType, input.sourceType)).all()
        : baseQuery.all();
      const total = rows[0]?.count ?? 0;
      return { total, pending: 0, stale: 0 };
    }),

  listSourceIdsByType: protectedProcedure
    .input(EmbeddingsListSourceIdsByTypeInputSchema)
    .output(EmbeddingsListSourceIdsByTypeOutputSchema)
    .query(({ input, ctx }) => {
      const rows = ctx.cerebrumDb
        .selectDistinct({ sourceId: embeddings.sourceId })
        .from(embeddings)
        .where(eq(embeddings.sourceType, input.sourceType))
        .all();
      return { sourceIds: rows.map((r) => r.sourceId) };
    }),
});
