/**
 * ts-rest contract for `workers.*` — the Glia curation workers.
 *
 * Routed under `/glia/workers/*` + `/glia/scores/*` + `/glia/orphans` so paths
 * never collide with the merged glia trust router. Non-identity domain — served
 * on the docker-network trust boundary with no per-request auth. The auditor's
 * contradiction check is LLM-backed (injectable; fake in tests); pruner /
 * consolidator / linker are pure scoring + proposal logic.
 */
import { initContract } from '@ts-rest/core';

import { errorBodySchema } from './rest-schemas.js';
import {
  engramIdBodySchema,
  orphansQuerySchema,
  orphansResponseSchema,
  qualityResultSchema,
  stalenessResultSchema,
  workerDryRunBodySchema,
  workerRunResultSchema,
} from './rest-workers-schemas.js';

const c = initContract();

export const cerebrumWorkersContract = c.router({
  runPruner: {
    method: 'POST',
    path: '/glia/workers/prune',
    summary: 'Run the pruner worker (staleness + orphan archival proposals).',
    body: workerDryRunBodySchema,
    responses: { 200: workerRunResultSchema },
  },
  runConsolidator: {
    method: 'POST',
    path: '/glia/workers/consolidate',
    summary: 'Run the consolidator worker (similar-engram merge proposals).',
    body: workerDryRunBodySchema,
    responses: { 200: workerRunResultSchema },
  },
  runLinker: {
    method: 'POST',
    path: '/glia/workers/link',
    summary: 'Run the linker worker (cross-reference proposals).',
    body: workerDryRunBodySchema,
    responses: { 200: workerRunResultSchema },
  },
  runAuditor: {
    method: 'POST',
    path: '/glia/workers/audit',
    summary: 'Run the auditor worker (quality, contradiction, coverage-gap).',
    body: workerDryRunBodySchema,
    responses: { 200: workerRunResultSchema },
  },
  getStalenessScore: {
    method: 'POST',
    path: '/glia/scores/staleness',
    summary: 'Compute the staleness score for a single engram.',
    body: engramIdBodySchema,
    responses: { 200: stalenessResultSchema, 404: errorBodySchema },
  },
  getQualityScore: {
    method: 'POST',
    path: '/glia/scores/quality',
    summary: 'Compute the quality score for a single engram.',
    body: engramIdBodySchema,
    responses: { 200: qualityResultSchema, 404: errorBodySchema },
  },
  getOrphans: {
    method: 'GET',
    path: '/glia/orphans',
    summary: 'List active engrams with no inbound links.',
    query: orphansQuerySchema,
    responses: { 200: orphansResponseSchema },
  },
});

export type CerebrumWorkersContract = typeof cerebrumWorkersContract;
