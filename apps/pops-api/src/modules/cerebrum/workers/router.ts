/**
 * cerebrum.glia tRPC router — Glia curation worker API (PRD-085).
 *
 * Procedures:
 *   runPruner        — run the pruner worker
 *   runConsolidator  — run the consolidator worker
 *   runLinker        — run the linker worker
 *   runAuditor       — run the auditor worker
 *   getStalenessScore — compute staleness score for a single engram
 *   getQualityScore   — compute quality score for a single engram
 *   getOrphans        — list engrams with no inbound links and no recent queries
 */
import { z } from 'zod';

import { getDrizzle } from '../../../db.js';
import { protectedProcedure, router } from '../../../trpc.js';
import { getEngramService } from '../instance.js';
import { HybridSearchService } from '../retrieval/hybrid-search.js';
import { AuditorWorker } from './auditor.js';
import { ConsolidatorWorker } from './consolidator.js';
import { LinkerWorker } from './linker.js';
import { PrunerWorker } from './pruner.js';
import { shouldSkipEngram } from './worker-base.js';

interface GliaDeps {
  engramService: ReturnType<typeof getEngramService>;
  searchService: HybridSearchService;
}

function buildDeps(): GliaDeps {
  return {
    engramService: getEngramService(),
    searchService: new HybridSearchService(getDrizzle()),
  };
}

export const gliaRouter = router({
  runPruner: protectedProcedure
    .input(z.object({ dryRun: z.boolean().optional().default(true) }))
    .mutation(async ({ input }) => {
      const worker = new PrunerWorker(buildDeps());
      return worker.run(input.dryRun);
    }),

  runConsolidator: protectedProcedure
    .input(z.object({ dryRun: z.boolean().optional().default(true) }))
    .mutation(async ({ input }) => {
      const worker = new ConsolidatorWorker(buildDeps());
      return worker.run(input.dryRun);
    }),

  runLinker: protectedProcedure
    .input(z.object({ dryRun: z.boolean().optional().default(true) }))
    .mutation(async ({ input }) => {
      const worker = new LinkerWorker(buildDeps());
      return worker.run(input.dryRun);
    }),

  runAuditor: protectedProcedure
    .input(z.object({ dryRun: z.boolean().optional().default(true) }))
    .mutation(async ({ input }) => {
      const worker = new AuditorWorker(buildDeps());
      return worker.run(input.dryRun);
    }),

  getStalenessScore: protectedProcedure
    .input(z.object({ engramId: z.string() }))
    .query(({ input }) => {
      const deps = buildDeps();
      const worker = new PrunerWorker(deps);
      const { engram } = deps.engramService.read(input.engramId);
      const allEngrams = deps.engramService.list({ status: 'active', limit: 10000 }).engrams;
      return worker.computeStaleness(engram, allEngrams);
    }),

  getQualityScore: protectedProcedure
    .input(z.object({ engramId: z.string() }))
    .query(({ input }) => {
      const deps = buildDeps();
      const worker = new AuditorWorker(deps);
      const { engram } = deps.engramService.read(input.engramId);
      return worker.computeQuality(engram);
    }),

  getOrphans: protectedProcedure
    .input(z.object({ limit: z.number().int().positive().max(200).optional().default(50) }))
    .query(({ input }) => {
      const deps = buildDeps();
      const { engrams } = deps.engramService.list({
        status: 'active',
        limit: 10000,
      });

      const activeEngrams = engrams.filter((e) => !shouldSkipEngram(e));

      // Find engrams with zero inbound links.
      const inboundCounts = new Map<string, number>();
      for (const e of activeEngrams) {
        for (const link of e.links) {
          inboundCounts.set(link, (inboundCounts.get(link) ?? 0) + 1);
        }
      }

      const orphans = activeEngrams
        .filter((e) => !inboundCounts.has(e.id) || inboundCounts.get(e.id) === 0)
        .slice(0, input.limit);

      return { engrams: orphans };
    }),
});
