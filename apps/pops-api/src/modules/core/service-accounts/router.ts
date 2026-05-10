/**
 * Admin tRPC router for service-account management.
 *
 * All procedures here are `userOnlyProcedure` — a service account must not
 * be able to mint or revoke other service accounts. The plaintext key is
 * returned exactly once from `create` and never readable afterwards.
 */
import { z } from 'zod';

import { router, userOnlyProcedure } from '../../../trpc.js';
import { createServiceAccount, listServiceAccounts, revokeServiceAccount } from './service.js';
import {
  CreateServiceAccountInputSchema,
  CreatedServiceAccountSchema,
  ServiceAccountSchema,
} from './types.js';

export const serviceAccountsRouter = router({
  list: userOnlyProcedure.output(z.array(ServiceAccountSchema)).query(() => {
    return listServiceAccounts();
  }),

  create: userOnlyProcedure
    .input(CreateServiceAccountInputSchema)
    .output(CreatedServiceAccountSchema)
    .mutation(async ({ input, ctx }) => {
      return createServiceAccount(input, ctx.user.email);
    }),

  revoke: userOnlyProcedure
    .input(z.object({ id: z.string().min(1) }))
    .output(z.object({ ok: z.literal(true) }))
    .mutation(({ input }) => {
      revokeServiceAccount(input.id);
      return { ok: true };
    }),
});
