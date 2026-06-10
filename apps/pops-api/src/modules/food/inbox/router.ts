/**
 * `food.inbox.*` tRPC router.
 *
 * PRD-136 mutations (approve / reject / unreject) operate on
 * ingest-originated recipe versions. Each delegates to `inboxService` in
 * `@pops/app-food-db`, which composes PRD-107's `promoteVersion` /
 * `archiveVersion` services inside a single Drizzle transaction. Errors are
 * surfaced as discriminated `{ ok: false, reason: ... }` rather than thrown
 * — the inbox UI (PRDs 134/135/138) branches on the reason to reload state
 * / show a banner without unwrapping a TRPCError.
 *
 * PRD-138 queries (listRejected / listFailed) feed the two non-default tabs
 * inside `/food/inbox`. Both are cursor-paginated and filterable; auth-dead
 * Instagram placeholders are intentionally excluded from `listFailed`
 * (those ship as `ok: true` partial drafts per PRD-130 and live in the
 * Drafts tab instead).
 *
 * See `docs/themes/07-food/prds/136-approve-reject-flow/README.md` and
 * `docs/themes/07-food/prds/138-rejected-and-failed-tabs/README.md`.
 */
import { inboxService } from '@pops/app-food-db';

import { getDrizzle } from '../../../db.js';
import { protectedProcedure, router } from '../../../trpc.js';
import { ApproveInputSchema, RejectInputSchema, UnrejectInputSchema } from './inputs.js';
import { listFailed } from './list-failed.js';
import { listRejected } from './list-rejected.js';
import {
  ListFailedInput,
  ListFailedOutput,
  ListRejectedInput,
  ListRejectedOutput,
} from './list-schemas.js';

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

  listRejected: protectedProcedure
    .input(ListRejectedInput)
    .output(ListRejectedOutput)
    .query(({ input }) => listRejected(getDrizzle(), input)),

  listFailed: protectedProcedure
    .input(ListFailedInput)
    .output(ListFailedOutput)
    .query(({ input }) => listFailed(getDrizzle(), input)),
});

export type InboxRouter = typeof inboxRouter;
