/**
 * `core.users.*` tRPC router (PRD-251 H7 — denormalisation reconciliation).
 *
 * Scope: a single read-only `get` procedure. Sibling pillars' nightly
 * reconciliation crons use this to ask "does the user URI
 * `pops://core/user/<email>` still resolve?". On 404 the consumer marks
 * the consumer row stale rather than deleting it (PRD-251 §"Existence is
 * best-effort").
 *
 * No write surface is exposed by design: owning-pillar writes are
 * forbidden by PRD-251, and the canonical user identity flows in from
 * Cloudflare Access / the dev-fallback path in `trpc.ts`.
 */
import { z } from 'zod';

import { usersService } from '@pops/core-db';

import { NotFoundError } from '../../shared/errors.js';
import { mapDomainErrors } from '../../shared/trpc-error-mapper.js';
import { protectedProcedure, router } from '../../trpc.js';

const GetUserInputSchema = z.object({
  email: z.string().min(1),
});

const UserSchema = z.object({
  email: z.string(),
});

export const usersRouter = router({
  get: protectedProcedure
    .input(GetUserInputSchema)
    .output(z.object({ data: UserSchema }))
    .query(({ input, ctx }) =>
      mapDomainErrors(() => {
        const user = usersService.getUser(ctx.coreDb, input.email);
        if (!user) throw new NotFoundError('user', input.email);
        return { data: user };
      })
    ),
});
