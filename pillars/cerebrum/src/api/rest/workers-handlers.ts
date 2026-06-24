/**
 * ts-rest handlers for `workers.*` (docs/prds/curation-workers) — the Glia curation workers.
 *
 * Each `run*` builds a request-scoped worker bound to the in-pillar
 * {@link EngramService} + {@link HybridSearchService} and runs it; `dryRun`
 * defaults to true so a bare call never mutates engrams. The auditor's
 * contradiction detector is the injected LLM port (fake in tests).
 *
 * `getStalenessScore` / `getQualityScore` read the engram via EngramService —
 * a missing id throws the pillar `NotFoundError` → 404 via `runHttp`.
 * `getOrphans` lists active engrams with zero inbound links.
 */
import { initServer } from '@ts-rest/express';

import { cerebrumWorkersContract } from '../../contract/rest-workers.js';
import { type CerebrumDb } from '../../db/index.js';
import { EngramService } from '../modules/engrams/service.js';
import { HybridSearchService } from '../modules/retrieval/hybrid-search.js';
import { AuditorWorker, type ContradictionDetector } from '../modules/workers/auditor.js';
import { ConsolidatorWorker } from '../modules/workers/consolidator.js';
import { LinkerWorker } from '../modules/workers/linker.js';
import { PrunerWorker } from '../modules/workers/pruner.js';
import { shouldSkipEngram, type WorkerBaseDeps } from '../modules/workers/worker-base.js';
import { runHttp } from './error-mapping.js';

import type BetterSqlite3 from 'better-sqlite3';

import type { OrphanEngramWire } from '../../contract/rest-workers-schemas.js';
import type { Engram } from '../modules/engrams/types.js';
import type { EmbeddingClient } from '../modules/retrieval/embedding-client.js';
import type { PeerClients } from '../modules/retrieval/peer-clients.js';
import type { TemplateRegistry } from '../modules/templates/registry.js';

const server: ReturnType<typeof initServer> = initServer();

export interface WorkersHandlerDeps {
  db: CerebrumDb;
  raw: BetterSqlite3.Database;
  vecAvailable: boolean;
  engramRoot: string;
  templates: TemplateRegistry;
  peers: PeerClients;
  embeddingClient?: EmbeddingClient;
  /** LLM-backed contradiction detector for the auditor (fake in tests). */
  contradictionDetector: ContradictionDetector;
}

function toOrphanWire(engram: Engram): OrphanEngramWire {
  return {
    id: engram.id,
    type: engram.type,
    title: engram.title,
    scopes: engram.scopes,
    tags: engram.tags,
    links: engram.links,
    status: engram.status,
    created: engram.created,
    modified: engram.modified,
    template: engram.template,
    wordCount: engram.wordCount,
  };
}

export function makeWorkersHandlers(
  deps: WorkersHandlerDeps
): ReturnType<typeof server.router<typeof cerebrumWorkersContract>> {
  const engramService = (): EngramService =>
    new EngramService({ root: deps.engramRoot, db: deps.db, templates: deps.templates });

  const searchService = (): HybridSearchService =>
    new HybridSearchService({
      db: deps.db,
      raw: deps.raw,
      vecAvailable: deps.vecAvailable,
      peers: deps.peers,
      embeddingClient: deps.embeddingClient,
    });

  const baseDeps = (): WorkerBaseDeps => ({
    engramService: engramService(),
    searchService: searchService(),
  });

  return server.router(cerebrumWorkersContract, {
    runPruner: async ({ body }) => ({
      status: 200,
      body: await new PrunerWorker(baseDeps()).run(body.dryRun ?? true),
    }),

    runConsolidator: async ({ body }) => ({
      status: 200,
      body: await new ConsolidatorWorker(baseDeps()).run(body.dryRun ?? true),
    }),

    runLinker: async ({ body }) => ({
      status: 200,
      body: await new LinkerWorker(baseDeps()).run(body.dryRun ?? true),
    }),

    runAuditor: async ({ body }) => ({
      status: 200,
      body: await new AuditorWorker({
        ...baseDeps(),
        contradictionDetector: deps.contradictionDetector,
      }).run(body.dryRun ?? true),
    }),

    getStalenessScore: async ({ body }) =>
      runHttp(() => {
        const svc = engramService();
        const worker = new PrunerWorker({ engramService: svc, searchService: searchService() });
        const { engram } = svc.read(body.engramId);
        const allEngrams = svc.list({ status: 'active', limit: 10000 }).engrams;
        return { status: 200 as const, body: worker.computeStaleness(engram, allEngrams) };
      }),

    getQualityScore: async ({ body }) =>
      runHttp(() => {
        const svc = engramService();
        const worker = new AuditorWorker({ engramService: svc, searchService: searchService() });
        const { engram } = svc.read(body.engramId);
        return { status: 200 as const, body: worker.computeQuality(engram) };
      }),

    getOrphans: async ({ query }) => {
      const limit = query.limit ?? 50;
      const { engrams } = engramService().list({ status: 'active', limit: 10000 });
      const active = engrams.filter((e) => !shouldSkipEngram(e));

      const inboundCounts = new Map<string, number>();
      for (const e of active) {
        for (const link of e.links) {
          inboundCounts.set(link, (inboundCounts.get(link) ?? 0) + 1);
        }
      }

      const orphans = active
        .filter((e) => (inboundCounts.get(e.id) ?? 0) === 0)
        .slice(0, limit)
        .map(toOrphanWire);

      return { status: 200, body: { engrams: orphans } };
    },
  });
}
