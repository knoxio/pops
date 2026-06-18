/**
 * `core.users.*` tRPC router (PRD-251 H7 — denormalisation reconciliation).
 *
 * Scope: a single read-only `get` procedure. Sibling pillars' nightly
 * reconciliation crons use this to ask "does the user URI
 * `pops://core/user/<email>` still resolve?". On 404 the consumer marks
 * the consumer row stale rather than deleting it (PRD-251 §"Existence is
 * best-effort").
 *
 * Input contract: URI shape (`{ uri: 'pops://core/user/<email>' }`). The
 * URI shape is the PRD-251 cross-pillar wire contract — every consumer
 * stores the denormalised reference as a URI on its own row, so passing
 * the URI through end-to-end avoids per-call parsing in the consumer and
 * keeps the same shape on both sides of the boundary.
 *
 * Malformed URIs (wrong scheme, wrong pillar, wrong type, missing id)
 * surface as `BAD_REQUEST`; URIs that parse but don't resolve to a known
 * user surface as `NOT_FOUND`.
 *
 * No write surface is exposed by design: owning-pillar writes are
 * forbidden by PRD-251, and the canonical user identity flows in from
 * Cloudflare Access / the dev-fallback path in `trpc.ts`.
 */
import { z } from 'zod';

import { usersService } from '../../../db/index.js';
import { NotFoundError, ValidationError } from '../../shared/errors.js';
import { mapDomainErrors } from '../../shared/trpc-error-mapper.js';
import { protectedProcedure, router } from '../../trpc.js';

const GetUserInputSchema = z.object({
  uri: z.string().min(1),
});

const UserSchema = z.object({
  uri: z.string(),
});

const URI_PATTERN = /^pops:\/\/core\/user\/(.+)$/;

function extractUserEmailFromUri(uri: string): string {
  const match = URI_PATTERN.exec(uri);
  if (!match || !match[1]) {
    throw new ValidationError({ reason: 'unsupported-uri', uri });
  }
  return match[1];
}

export const usersRouter = router({
  get: protectedProcedure
    .input(GetUserInputSchema)
    .output(z.object({ data: UserSchema }))
    .query(({ input, ctx }) =>
      mapDomainErrors(() => {
        const email = extractUserEmailFromUri(input.uri);
        const user = usersService.getUser(ctx.coreDb, email);
        if (!user) throw new NotFoundError('user', input.uri);
        return { data: { uri: input.uri } };
      })
    ),
});
