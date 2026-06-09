/**
 * `food.inbox.*` tRPC router — PRD-136.
 *
 * Three mutations (approve / reject / unreject) operating on
 * ingest-originated recipe versions. Each delegates to `inboxService` in
 * `@pops/app-food-db`, which composes PRD-107's `promoteVersion` /
 * `archiveVersion` services inside a single Drizzle transaction.
 *
 * Errors are surfaced as discriminated `{ ok: false, reason: ... }` rather
 * than thrown — the inbox UI (PRDs 134/135/138) branches on the reason to
 * reload state / show a banner without unwrapping a TRPCError.
 *
 * See `docs/themes/07-food/prds/136-approve-reject-flow/README.md`.
 */
import { inboxService } from '@pops/app-food-db';

import { getDrizzle } from '../../../db.js';
import { protectedProcedure, router } from '../../../trpc.js';
import { ApproveInputSchema, RejectInputSchema, UnrejectInputSchema } from './inputs.js';

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
});

export type InboxRouter = typeof inboxRouter;
