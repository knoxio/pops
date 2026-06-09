import { z } from 'zod';

/**
 * Admin tRPC router for service-account management.
 *
 * All procedures here are `userOnlyProcedure` — a service account must not
 * be able to mint or revoke other service accounts. The plaintext key is
 * returned exactly once from `create` and never readable afterwards.
 *
 * Domain errors from `@pops/core-db` are translated to `HttpError`
 * subclasses inside the handler and then routed through
 * `mapDomainErrorsAsync` / `mapDomainErrors` so the tRPC layer sees a
 * proper `TRPCError` (with the right wire-level `code`, e.g.
 * `BAD_REQUEST` / `NOT_FOUND` / `CONFLICT`). Throwing `HttpError`
 * directly out of a tRPC handler surfaces as `INTERNAL_SERVER_ERROR`
 * at the OpenAPI boundary.
 */
import {
  ServiceAccountAlreadyRevokedError,
  ServiceAccountNameAlreadyExistsError,
  ServiceAccountNotFoundError,
  serviceAccountsService,
} from '@pops/core-db';

import { getCoreDrizzle } from '../../../db.js';
import { ConflictError, NotFoundError, ValidationError } from '../../../shared/errors.js';
import { mapDomainErrors, mapDomainErrorsAsync } from '../../../shared/trpc-error-mapper.js';
import { router, userOnlyProcedure } from '../../../trpc.js';
import {
  CreateServiceAccountInputSchema,
  CreatedServiceAccountSchema,
  ServiceAccountSchema,
} from './types.js';

export const serviceAccountsRouter = router({
  list: userOnlyProcedure.output(z.array(ServiceAccountSchema)).query(() => {
    return serviceAccountsService.listServiceAccounts(getCoreDrizzle());
  }),

  create: userOnlyProcedure
    .input(CreateServiceAccountInputSchema)
    .output(CreatedServiceAccountSchema)
    .mutation(({ input, ctx }) =>
      mapDomainErrorsAsync(async () => {
        try {
          return await serviceAccountsService.createServiceAccount(
            getCoreDrizzle(),
            input,
            ctx.user.email
          );
        } catch (err) {
          if (err instanceof ServiceAccountNameAlreadyExistsError) {
            throw new ValidationError({ message: err.message });
          }
          throw err;
        }
      })
    ),

  revoke: userOnlyProcedure
    .input(z.object({ id: z.string().min(1) }))
    .output(z.object({ ok: z.literal(true) }))
    .mutation(({ input }) =>
      mapDomainErrors(() => {
        try {
          serviceAccountsService.revokeServiceAccount(getCoreDrizzle(), input.id);
        } catch (err) {
          if (err instanceof ServiceAccountNotFoundError) {
            throw new NotFoundError('ServiceAccount', input.id);
          }
          if (err instanceof ServiceAccountAlreadyRevokedError) {
            throw new ConflictError(err.message);
          }
          throw err;
        }
        return { ok: true };
      })
    ),
});
