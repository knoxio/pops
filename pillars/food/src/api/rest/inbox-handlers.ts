/**
 * Handlers for the `inbox.*` sub-router. Pure DB reads/writes; mutations
 * and the inspector return the service's discriminated result on 200. The
 * list endpoints decode the opaque string cursor into the service's cursor
 * shape and apply the default page size.
 */
import { inboxInspectorService, inboxQueries, inboxService } from '../../db/index.js';
import { runHttp } from './error-mapping.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { foodInboxContract } from '../../contract/rest-inbox.js';
import type { FoodDb } from '../../db/index.js';

type Req = ServerInferRequest<typeof foodInboxContract>;

const DEFAULT_LIMIT = 20;

export function makeInboxHandlers(db: FoodDb) {
  return {
    approve: ({ body }: Req['approve']) =>
      runHttp(() => ({
        status: 200 as const,
        body: inboxService.approveDraft(db, body.versionId),
      })),

    reject: ({ body }: Req['reject']) =>
      runHttp(() => ({
        status: 200 as const,
        body: inboxService.rejectDraft(db, {
          versionId: body.versionId,
          reason: body.reason,
          note: body.note,
        }),
      })),

    unreject: ({ body }: Req['unreject']) =>
      runHttp(() => ({
        status: 200 as const,
        body: inboxService.unrejectDraft(db, body.versionId),
      })),

    list: ({ body }: Req['list']) =>
      runHttp(() => ({
        status: 200 as const,
        body: inboxQueries.listDrafts(db, {
          bands: body.bands,
          kinds: body.kinds,
          partialReasons: body.partialReasons,
          freshOnly: body.freshOnly,
          sort: body.sort,
          cursor: body.cursor === undefined ? null : inboxQueries.decodeDraftsCursor(body.cursor),
          limit: body.limit ?? DEFAULT_LIMIT,
        }),
      })),

    listRejected: ({ body }: Req['listRejected']) =>
      runHttp(() => ({
        status: 200 as const,
        body: inboxQueries.listRejectedVersions(db, {
          reasons: body.reasons,
          kinds: body.kinds,
          sinceDays: body.sinceDays,
          cursor: body.cursor === undefined ? null : inboxQueries.decodeCursor(body.cursor),
          limit: body.limit ?? DEFAULT_LIMIT,
        }),
      })),

    listFailed: ({ body }: Req['listFailed']) =>
      runHttp(() => ({
        status: 200 as const,
        body: inboxQueries.listFailedSources(db, {
          errorCodes: body.errorCodes,
          kinds: body.kinds,
          sinceDays: body.sinceDays,
          cursor: body.cursor === undefined ? null : inboxQueries.decodeCursor(body.cursor),
          limit: body.limit ?? DEFAULT_LIMIT,
        }),
      })),

    failedErrorCodes: () =>
      runHttp(() => ({
        status: 200 as const,
        body: { items: inboxQueries.listFailedErrorCodes(db) },
      })),

    pendingCount: () =>
      runHttp(() => ({
        status: 200 as const,
        body: { count: inboxQueries.countPendingDrafts(db) },
      })),

    getForReview: ({ query }: Req['getForReview']) =>
      runHttp(() => ({
        status: 200 as const,
        body: inboxInspectorService.getInspectorView(db, query.sourceId),
      })),
  };
}
