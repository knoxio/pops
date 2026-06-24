/**
 * `users.*` sub-router — read-only cross-pillar user existence check.
 *
 * A single read that takes a `pops://core/user/<email>` URI and answers "does
 * this user URI still resolve?". It is a `GET` with the URI passed as a `uri`
 * query param — the URI's `://` and slashes make a path param a poor fit. The
 * response shape is `{ data: { uri } }`.
 *
 * Malformed URIs (wrong scheme/pillar/type, missing id) surface as 400;
 * URIs that parse but don't resolve to a known user surface as 404.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { ERR_RESPONSES, NonEmptyString } from './rest-schemas.js';

const c = initContract();

/** Wire shape served by the user-URI resolve read. */
export const UserSchema = z.object({ uri: z.string() });

export const coreUsersContract = c.router({
  get: {
    method: 'GET',
    path: '/users',
    query: z.object({ uri: NonEmptyString }),
    responses: { 200: z.object({ data: UserSchema }), ...ERR_RESPONSES },
    summary: 'Resolve a user URI (pops://core/user/<email>) for cross-pillar reconciliation',
  },
});
