/**
 * Wire schemas for `workers.*` — the Glia curation workers.
 *
 * Served under `/glia/workers/*` + `/glia/scores/*` + `/glia/orphans` to avoid
 * colliding with the merged glia trust router (which owns `/glia/actions`,
 * `/glia/trust-state`, `/glia/digest`). Kept under its own contract key
 * (`workers`) so the operationIds stay `workers*`.
 *
 * The worker `run*` procedures return ephemeral `GliaAction` records (the
 * proposal set) plus processed/skipped counts — they don't persist to
 * `glia_actions` in propose/dryRun mode. The `payload` is an open bag (merge
 * plan / link pair / quality breakdown / …).
 */
import { z } from 'zod';

export const workerDryRunBodySchema = z.object({
  dryRun: z.boolean().optional(),
});
export type WorkerDryRunBodyWire = z.infer<typeof workerDryRunBodySchema>;

export const gliaActionWire = z.object({
  id: z.string(),
  actionType: z.enum(['prune', 'consolidate', 'link', 'audit']),
  affectedIds: z.array(z.string()),
  rationale: z.string(),
  payload: z.record(z.string(), z.unknown()),
  phase: z.enum(['propose', 'act_report', 'silent']),
  status: z.enum(['proposed', 'executed', 'error']),
  createdAt: z.string(),
});
export type GliaWorkerActionWire = z.infer<typeof gliaActionWire>;

export const workerRunResultSchema = z.object({
  actions: z.array(gliaActionWire),
  processed: z.number().int(),
  skipped: z.number().int(),
});
export type WorkerRunResultWire = z.infer<typeof workerRunResultSchema>;

export const engramIdBodySchema = z.object({
  engramId: z.string().min(1),
});
export type EngramIdBodyWire = z.infer<typeof engramIdBodySchema>;

export const stalenessFactorsSchema = z.object({
  daysSinceModified: z.number(),
  daysSinceReferenced: z.number(),
  inboundLinkCount: z.number(),
  queryHitCount: z.number(),
});

export const stalenessResultSchema = z.object({
  score: z.number(),
  factors: stalenessFactorsSchema,
});
export type StalenessResultWire = z.infer<typeof stalenessResultSchema>;

export const qualityFactorsSchema = z.object({
  completeness: z.number(),
  specificity: z.number(),
  templateFit: z.number(),
  linkDensity: z.number(),
});

export const qualityResultSchema = z.object({
  score: z.number(),
  factors: qualityFactorsSchema,
});
export type QualityResultWire = z.infer<typeof qualityResultSchema>;

export const orphanEngramWire = z.object({
  id: z.string(),
  type: z.string(),
  title: z.string(),
  scopes: z.array(z.string()),
  tags: z.array(z.string()),
  links: z.array(z.string()),
  status: z.string(),
  created: z.string(),
  modified: z.string(),
  template: z.string().nullable(),
  wordCount: z.number().int(),
});
export type OrphanEngramWire = z.infer<typeof orphanEngramWire>;

export const orphansResponseSchema = z.object({
  engrams: z.array(orphanEngramWire),
});
export type OrphansResponseWire = z.infer<typeof orphansResponseSchema>;

export const orphansQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(200).optional(),
});
