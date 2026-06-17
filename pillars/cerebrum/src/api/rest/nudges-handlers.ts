/**
 * ts-rest handlers for `cerebrum.nudges.*` (PRD-084).
 *
 * Thin adapter over {@link createNudgeReadService} bound to the pillar db
 * handle. Reads the `nudge_log` table; `dismiss` distinguishes a missing
 * nudge (404) from a non-pending nudge (409) — `runHttp` maps the pillar
 * `NotFoundError` → 404 and `ConflictError` → 409.
 *
 * The legacy monolith collapsed missing-vs-already-dismissed into one
 * `BAD_REQUEST`; the migrated surface keeps the tighter split so consumers
 * can tell a stale UI cache apart from a no-op double-click (parity with the
 * pops-cerebrum-api shadow router).
 */
import { initServer } from '@ts-rest/express';

import { cerebrumNudgesContract } from '../../contract/rest-nudges.js';
import { type CerebrumDb } from '../../db/index.js';
import { extractContradiction } from '../modules/nudges/contradiction.js';
import { createNudgeReadService } from '../modules/nudges/service.js';
import { ConflictError, NotFoundError } from '../shared/errors.js';
import { runHttp } from './error-mapping.js';

const server: ReturnType<typeof initServer> = initServer();

export function makeNudgesHandlers(
  db: CerebrumDb
): ReturnType<typeof server.router<typeof cerebrumNudgesContract>> {
  const service = createNudgeReadService(db);

  return server.router(cerebrumNudgesContract, {
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
  });
}
