import { z } from 'zod';

/**
 * Admin tRPC router for service-account management.
 *
 * All procedures here are `userOnlyProcedure` — a service account must not
 * be able to mint or revoke other service accounts. The plaintext key is
 * returned exactly once from `create` and never readable afterwards.
 */
import {
  ServiceAccountAlreadyRevokedError,
  ServiceAccountNameAlreadyExistsError,
  ServiceAccountNotFoundError,
  serviceAccountsService,
} from '@pops/core-db';

import { getDrizzle } from '../../../db.js';
import { HttpError, NotFoundError, ValidationError } from '../../../shared/errors.js';
import { router, userOnlyProcedure } from '../../../trpc.js';
import {
  CreateServiceAccountInputSchema,
  CreatedServiceAccountSchema,
  ServiceAccountSchema,
} from './types.js';

export const serviceAccountsRouter = router({
  list: userOnlyProcedure.output(z.array(ServiceAccountSchema)).query(() => {
    return serviceAccountsService.listServiceAccounts(getDrizzle());
  }),

  create: userOnlyProcedure
    .input(CreateServiceAccountInputSchema)
    .output(CreatedServiceAccountSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        return await serviceAccountsService.createServiceAccount(
          getDrizzle(),
          input,
          ctx.user.email
        );
      } catch (err) {
        if (err instanceof ServiceAccountNameAlreadyExistsError) {
          throw new ValidationError({ message: err.message });
        }
        throw err;
      }
    }),

  revoke: userOnlyProcedure
    .input(z.object({ id: z.string().min(1) }))
    .output(z.object({ ok: z.literal(true) }))
    .mutation(({ input }) => {
      try {
        serviceAccountsService.revokeServiceAccount(getDrizzle(), input.id);
      } catch (err) {
        if (err instanceof ServiceAccountNotFoundError) {
          throw new NotFoundError('ServiceAccount', input.id);
        }
        if (err instanceof ServiceAccountAlreadyRevokedError) {
          throw new HttpError(409, err.message);
        }
        throw err;
      }
      return { ok: true };
    }),
});
