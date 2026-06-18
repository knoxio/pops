/**
 * Service-accounts admin router — the first writer slice cut over from
 * pops-api into pops-core-api as part of Phase 5 PR 1 (Track M1).
 *
 * Procedure surface is identical to
 * `apps/pops-api/src/modules/core/service-accounts/router.ts`:
 *   - `core.serviceAccounts.list`     userOnly  query
 *   - `core.serviceAccounts.create`   userOnly  mutation
 *   - `core.serviceAccounts.revoke`   userOnly  mutation
 *
 * Domain errors from `@pops/core-db` are translated to local `HttpError`
 * subclasses and then routed through `mapDomainErrors*` so the tRPC layer
 * sees a proper `TRPCError` with the right wire-level code.
 *
 * Until Phase 5 PR 2 flips the dispatcher / nginx routing rules, the
 * legacy pops-api router keeps serving real traffic — this one is a
 * shadow ready to take over.
 */
import { z } from 'zod';

import {
  ServiceAccountAlreadyRevokedError,
  ServiceAccountNameAlreadyExistsError,
  ServiceAccountNotFoundError,
  serviceAccountsService,
} from '../../../db/index.js';
import { ConflictError, NotFoundError, ValidationError } from '../../shared/errors.js';
import { mapDomainErrors, mapDomainErrorsAsync } from '../../shared/trpc-error-mapper.js';
import { router, userOnlyProcedure } from '../../trpc.js';
import {
  CreateServiceAccountInputSchema,
  CreatedServiceAccountSchema,
  ServiceAccountSchema,
} from './types.js';

export const serviceAccountsRouter = router({
  list: userOnlyProcedure.output(z.array(ServiceAccountSchema)).query(({ ctx }) => {
    return serviceAccountsService.listServiceAccounts(ctx.coreDb);
  }),

  create: userOnlyProcedure
    .input(CreateServiceAccountInputSchema)
    .output(CreatedServiceAccountSchema)
    .mutation(({ input, ctx }) =>
      mapDomainErrorsAsync(async () => {
        try {
          return await serviceAccountsService.createServiceAccount(
            ctx.coreDb,
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
    .mutation(({ input, ctx }) =>
      mapDomainErrors(() => {
        try {
          serviceAccountsService.revokeServiceAccount(ctx.coreDb, input.id);
        } catch (err) {
          if (err instanceof ServiceAccountNotFoundError) {
            throw new NotFoundError('ServiceAccount', input.id);
          }
          if (err instanceof ServiceAccountAlreadyRevokedError) {
            throw new ConflictError(err.message);
          }
          throw err;
        }
        return { ok: true as const };
      })
    ),
});
