/**
 * Index (thalamus) wire schemas.
 *
 * PURE zod module — no ts-rest, no Express. Imported by BOTH the index contract
 * (`rest-index.ts`) and the test client so the request/response shapes have a
 * single source of truth (mirrors the ingest split). The `cerebrum.index.*`
 * domain drives watcher health, on-demand reindex, cross-source re-embedding,
 * and reconciliation dry-runs — all on the docker-net trust boundary.
 */
import { z } from 'zod';

export const indexStatusResponseSchema = z.object({
  watcher: z.object({
    watching: z.boolean(),
    lastEventAt: z.string().nullable(),
    watchedPaths: z.number().int().nonnegative(),
  }),
  embeddingsQueue: z.object({
    name: z.string(),
    pendingCount: z.number().int().nonnegative().nullable(),
  }),
});
export type IndexStatusResponseWire = z.infer<typeof indexStatusResponseSchema>;

export const indexReindexBodySchema = z.object({
  force: z.boolean().optional(),
});
export type IndexReindexBody = z.infer<typeof indexReindexBodySchema>;

export const indexReindexResponseSchema = z.object({
  indexed: z.number().int().nonnegative(),
  enqueued: z.number().int().nonnegative(),
});
export type IndexReindexResponseWire = z.infer<typeof indexReindexResponseSchema>;

export const indexReindexSourcesBodySchema = z.object({
  sourceTypes: z.array(z.string().min(1)).optional(),
});
export type IndexReindexSourcesBody = z.infer<typeof indexReindexSourcesBodySchema>;

export const indexReindexSourcesResponseSchema = z.object({
  enqueued: z.number().int().nonnegative(),
  sourceTypes: z.array(z.string()),
});
export type IndexReindexSourcesResponseWire = z.infer<typeof indexReindexSourcesResponseSchema>;

export const indexReconcileBodySchema = z.object({
  dryRun: z.boolean().optional(),
});
export type IndexReconcileBody = z.infer<typeof indexReconcileBodySchema>;

export const indexReconcileResponseSchema = z.object({
  missing: z.array(z.string()),
  orphaned: z.array(z.string()),
  dryRun: z.boolean(),
});
export type IndexReconcileResponseWire = z.infer<typeof indexReconcileResponseSchema>;
