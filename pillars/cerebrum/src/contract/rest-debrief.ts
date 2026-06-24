/**
 * ts-rest contract for `cerebrum.debrief.*`.
 *
 * Read/write/delete surface over `debrief_sessions` + `debrief_results`. The
 * media tuple (`mediaType`/`mediaId`), `watchHistoryId`, `dimensionId` and
 * `comparisonId` are soft pointers into the media pillar (ADR-026) — no
 * cross-DB FK and no cross-pillar call leaks into this surface.
 *
 *   - `get`                    → POST /debrief/get                  → { data: session | null }
 *   - `getByMedia`             → POST /debrief/get-by-media         → { data: session | null }
 *   - `listPending`            → POST /debrief/list-pending         → { data, pagination }
 *   - `record`                 → POST /debrief/record               → { data: result } (404 no session)
 *   - `create`                 → POST /debrief                      → { data: session } (idempotent)
 *   - `logWatchCompletion`     → POST /debrief/log-watch-completion → { sessionId, dimensionsQueued }
 *   - `dismiss`                → POST /debrief/:sessionId/dismiss   → { data: session } (idempotent, 404)
 *   - `deleteByWatchHistoryId` → POST /debrief/delete-by-watch-history → { deletedSessions, deletedResults }
 *
 * `get` / `getByMedia` return `{ data: null }` for a benign miss rather than a
 * 404. `record` / `dismiss` 404 on an unknown session — they are state-changing
 * calls, so the typed 404 is the right shape.
 *
 * `dimensionsQueued` stays at `0`: the status fan-out needs the media pillar's
 * `comparison_dimensions`, which the cerebrum container has no handle to.
 * Non-identity domain — docker-network trust, no per-request auth.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  debriefCreateInputSchema,
  debriefDeleteByWatchHistoryInputSchema,
  debriefDeleteByWatchHistoryResponseSchema,
  debriefGetByMediaInputSchema,
  debriefGetInputSchema,
  debriefListPendingInputSchema,
  debriefListPendingResponseSchema,
  debriefLogWatchCompletionInputSchema,
  debriefLogWatchCompletionResponseSchema,
  debriefRecordInputSchema,
  debriefResultResponseSchema,
  debriefSessionIdParamsSchema,
  debriefSessionNullableResponseSchema,
  debriefSessionResponseSchema,
} from './rest-debrief-schemas.js';
import { errorBodySchema } from './rest-schemas.js';

const c = initContract();

export const cerebrumDebriefContract = c.router({
  get: {
    method: 'POST',
    path: '/debrief/get',
    summary: 'Fetch a debrief session by id; null when absent.',
    body: debriefGetInputSchema,
    responses: {
      200: debriefSessionNullableResponseSchema,
    },
  },
  getByMedia: {
    method: 'POST',
    path: '/debrief/get-by-media',
    summary: 'Most recent pending/active session for a media tuple; null when absent.',
    body: debriefGetByMediaInputSchema,
    responses: {
      200: debriefSessionNullableResponseSchema,
    },
  },
  listPending: {
    method: 'POST',
    path: '/debrief/list-pending',
    summary: 'Paginated list of pending sessions, optionally narrowed by media tuple.',
    body: debriefListPendingInputSchema,
    responses: {
      200: debriefListPendingResponseSchema,
    },
  },
  record: {
    method: 'POST',
    path: '/debrief/record',
    summary: 'Record a per-dimension reflection result for a session.',
    body: debriefRecordInputSchema,
    responses: {
      200: debriefResultResponseSchema,
      404: errorBodySchema,
    },
  },
  create: {
    method: 'POST',
    path: '/debrief',
    summary:
      'Create a debrief session; replaces any prior pending/active session for the media tuple.',
    body: debriefCreateInputSchema,
    responses: {
      200: debriefSessionResponseSchema,
    },
  },
  logWatchCompletion: {
    method: 'POST',
    path: '/debrief/log-watch-completion',
    summary: 'Option D entry point — creates a session; dimensionsQueued is 0.',
    body: debriefLogWatchCompletionInputSchema,
    responses: {
      200: debriefLogWatchCompletionResponseSchema,
    },
  },
  dismiss: {
    method: 'POST',
    path: '/debrief/:sessionId/dismiss',
    summary: 'Dismiss a session (status → complete); idempotent, 404 on unknown id.',
    pathParams: debriefSessionIdParamsSchema,
    body: z.object({}),
    responses: {
      200: debriefSessionResponseSchema,
      404: errorBodySchema,
    },
  },
  deleteByWatchHistoryId: {
    method: 'POST',
    path: '/debrief/delete-by-watch-history',
    summary: 'Cascade-delete debrief rows pinned to a watch_history id.',
    body: debriefDeleteByWatchHistoryInputSchema,
    responses: {
      200: debriefDeleteByWatchHistoryResponseSchema,
    },
  },
});
