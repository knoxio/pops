/**
 * ts-rest handlers for `cerebrum.nudges.*` (pillars/cerebrum/docs/prds/proactive-nudges).
 *
 * Read/dismiss ride {@link createNudgeReadService} bound to the pillar db
 * handle; the write surface (`scan` / `act` / `configure`) rides
 * {@link createNudgeWriteService}, which composes the in-pillar retrieval +
 * engrams services and the injectable contradiction analyzer. `dismiss` /
 * `act` distinguish a missing nudge (404) from a non-pending nudge (409) —
 * `runHttp` maps the pillar `NotFoundError` → 404 and `ConflictError` → 409 —
 * so consumers can tell a stale UI cache apart from a no-op double-click.
 */
import { initServer } from '@ts-rest/express';

import { cerebrumNudgesContract } from '../../contract/rest-nudges.js';
import { type CerebrumDb, nudgeLogService } from '../../db/index.js';
import { extractContradiction } from '../modules/nudges/contradiction.js';
import { createNudgeReadService } from '../modules/nudges/service.js';
import { createNudgeWriteService, type ThresholdsStore } from '../modules/nudges/write-service.js';
import { ConflictError, NotFoundError } from '../shared/errors.js';
import { runHttp } from './error-mapping.js';

import type { EngramService } from '../modules/engrams/service.js';
import type { ContradictionAnalyzer } from '../modules/nudges/contradiction-analyzer.js';
import type { HybridSearchService } from '../modules/retrieval/hybrid-search.js';

const server: ReturnType<typeof initServer> = initServer();

export interface NudgesHandlerDeps {
  db: CerebrumDb;
  searchService: HybridSearchService;
  engramService: EngramService;
  contradictionAnalyzer: ContradictionAnalyzer;
  /** In-process thresholds store — `configure` mutates it, `scan` reads it. */
  thresholdsStore: ThresholdsStore;
}

export function makeNudgesHandlers(
  deps: NudgesHandlerDeps
): ReturnType<typeof server.router<typeof cerebrumNudgesContract>> {
  const service = createNudgeReadService(deps.db);
  const writeService = createNudgeWriteService({
    db: deps.db,
    searchService: deps.searchService,
    engramService: deps.engramService,
    contradictionAnalyzer: deps.contradictionAnalyzer,
    thresholdsStore: deps.thresholdsStore,
  });

  return server.router(cerebrumNudgesContract, {
    create: async ({ body }) => ({
      status: 200,
      body: {
        nudge: nudgeLogService.createNudge(deps.db, {
          type: body.type,
          title: body.title,
          body: body.body,
          priority: body.priority,
          engramIds: body.engramIds,
          expiresAt: body.expiresAt,
          action: body.action,
        }),
      },
    }),

    list: async ({ body }) => ({
      status: 200,
      body: service.list(body),
    }),

    get: async ({ params }) =>
      runHttp(() => {
        const nudge = service.get(params.id);
        if (!nudge) throw new NotFoundError('Nudge', params.id);
        return { status: 200, body: { nudge } };
      }),

    dismiss: async ({ params }) =>
      runHttp(() => {
        const existing = service.get(params.id);
        if (!existing) throw new NotFoundError('Nudge', params.id);
        if (existing.status !== 'pending') {
          throw new ConflictError(
            `Nudge '${params.id}' is not pending (status=${existing.status}).`
          );
        }
        const result = service.dismiss(params.id);
        if (!result.success) {
          throw new ConflictError(`Nudge '${params.id}' could not be dismissed.`);
        }
        return { status: 200, body: result };
      }),

    contradictions: async ({ body }) => {
      const status = body.status === undefined ? 'pending' : body.status;
      const result = service.listContradictions({
        status,
        limit: body.limit ?? 50,
        offset: body.offset ?? 0,
      });
      const contradictions = result.nudges
        .map((nudge) => {
          const evidence = extractContradiction(nudge.action?.params);
          if (!evidence) return null;
          return {
            id: nudge.id,
            createdAt: nudge.createdAt,
            status: nudge.status,
            priority: nudge.priority,
            title: nudge.title,
            ...evidence,
          };
        })
        .filter((row): row is NonNullable<typeof row> => row !== null);
      return { status: 200, body: { contradictions, total: result.total } };
    },

    scan: async ({ body }) => ({
      status: 200,
      body: await writeService.scan(body.type),
    }),

    act: async ({ params }) =>
      runHttp(async () => {
        const existing = service.get(params.id);
        if (!existing) throw new NotFoundError('Nudge', params.id);
        if (existing.status !== 'pending') {
          throw new ConflictError(
            `Nudge '${params.id}' is not pending (status=${existing.status}).`
          );
        }
        const result = await writeService.act(params.id);
        if (!result.success) {
          throw new ConflictError(`Nudge '${params.id}' could not be acted on.`);
        }
        return { status: 200, body: { result } };
      }),

    configure: async ({ body }) => ({
      status: 200,
      body: writeService.configure(body),
    }),
  });
}
