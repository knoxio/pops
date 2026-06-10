/**
 * `food.inbox.*` tRPC router — PRDs 136 + 138.
 *
 * Mutations (PRD-136):
 *   - approve / reject / unreject — operate on ingest-originated drafts,
 *     each delegating to `inboxService.{approve,reject,unreject}Draft`
 *     which composes PRD-107's `promoteVersion` / `archiveVersion` inside
 *     a single Drizzle transaction. Errors surface as discriminated
 *     `{ ok: false, reason }` rather than thrown.
 *
 * Queries (PRD-138):
 *   - listRejected — Rejected tab rows (archived versions with a
 *     `recipe_version_rejections` row). `(rejected_at DESC, version_id DESC)`
 *     cursor pagination; reason / kind / sinceDays filter chips.
 *   - listFailed — Failed-ingests tab rows (ingest_sources with
 *     `error_code IS NOT NULL`). `(ingested_at DESC, id DESC)` cursor;
 *     errorCode / kind / sinceDays filter chips.
 *   - failedErrorCodes — distinct error codes with at least one failed row,
 *     used to populate the Error-code filter chip.
 *
 * See `docs/themes/07-food/prds/136-approve-reject-flow/README.md` and
 * `docs/themes/07-food/prds/138-rejected-and-failed-tabs/README.md`.
 */
import { inboxInspectorService, inboxQueries, inboxService } from '@pops/app-food-db';

import { getDrizzle } from '../../../db.js';
import { protectedProcedure, router } from '../../../trpc.js';
import { ListDraftsInputSchema } from './drafts-inputs.js';
import {
  ApproveInputSchema,
  GetForReviewInputSchema,
  RejectInputSchema,
  UnrejectInputSchema,
} from './inputs.js';
import {
  DEFAULT_INBOX_LIST_LIMIT,
  ListFailedInputSchema,
  ListRejectedInputSchema,
} from './list-inputs.js';

export const inboxRouter = router({
  approve: protectedProcedure.input(ApproveInputSchema).mutation(({ input }) => {
    return inboxService.approveDraft(getDrizzle(), input.versionId);
  }),

  reject: protectedProcedure.input(RejectInputSchema).mutation(({ input }) => {
    return inboxService.rejectDraft(getDrizzle(), {
      versionId: input.versionId,
      reason: input.reason,
      note: input.note ?? null,
    });
  }),

  unreject: protectedProcedure.input(UnrejectInputSchema).mutation(({ input }) => {
    return inboxService.unrejectDraft(getDrizzle(), input.versionId);
  }),

  listRejected: protectedProcedure.input(ListRejectedInputSchema).query(({ input }) => {
    const cursor = input.cursor === undefined ? null : inboxQueries.decodeCursor(input.cursor);
    return inboxQueries.listRejectedVersions(getDrizzle(), {
      reasons: input.reasons,
      kinds: input.kinds,
      sinceDays: input.sinceDays,
      cursor,
      limit: input.limit ?? DEFAULT_INBOX_LIST_LIMIT,
    });
  }),

  listFailed: protectedProcedure.input(ListFailedInputSchema).query(({ input }) => {
    const cursor = input.cursor === undefined ? null : inboxQueries.decodeCursor(input.cursor);
    return inboxQueries.listFailedSources(getDrizzle(), {
      errorCodes: input.errorCodes,
      kinds: input.kinds,
      sinceDays: input.sinceDays,
      cursor,
      limit: input.limit ?? DEFAULT_INBOX_LIST_LIMIT,
    });
  }),

  failedErrorCodes: protectedProcedure.query(() => {
    return inboxQueries.listFailedErrorCodes(getDrizzle());
  }),

  list: protectedProcedure.input(ListDraftsInputSchema).query(({ input }) => {
    const cursor =
      input.cursor === undefined ? null : inboxQueries.decodeDraftsCursor(input.cursor);
    return inboxQueries.listDrafts(getDrizzle(), {
      bands: input.bands,
      kinds: input.kinds,
      partialReasons: input.partialReasons,
      freshOnly: input.freshOnly,
      sort: input.sort,
      cursor,
      limit: input.limit ?? DEFAULT_INBOX_LIST_LIMIT,
    });
  }),

  pendingCount: protectedProcedure.query(() => {
    return { count: inboxQueries.countPendingDrafts(getDrizzle()) };
  }),

  // PRD-135 — per-draft inspector composer. One round-trip; the result is a
  // discriminated `{ ok: true, review } | { ok: false, reason: 'SourceNotFound' }`
  // so the UI handles the 404 path without a TRPCError translation.
  getForReview: protectedProcedure.input(GetForReviewInputSchema).query(({ input }) => {
    return inboxInspectorService.getInspectorView(getDrizzle(), input.sourceId);
  }),
});

export type InboxRouter = typeof inboxRouter;
