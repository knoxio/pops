/**
 * Handlers for the `users.*` sub-router.
 *
 * Wraps the read-only `usersService.getUser` lookup: a malformed URI is a 400
 * (`ValidationError`), a URI that parses but resolves to no known user is a 404
 * (`NotFoundError`). The wire shape is `{ data: { uri } }`.
 */
import { type CoreDb, usersService } from '../../db/index.js';
import { NotFoundError, ValidationError } from '../shared/errors.js';
import { runHttp } from './error-mapping.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { coreUsersContract } from '../../contract/rest-users.js';

type Req = ServerInferRequest<typeof coreUsersContract>;

const URI_PATTERN = /^pops:\/\/core\/user\/(.+)$/;

function extractUserEmailFromUri(uri: string): string {
  const match = URI_PATTERN.exec(uri);
  if (!match || !match[1]) {
    throw new ValidationError({ reason: 'unsupported-uri', uri });
  }
  return match[1];
}

export function makeUsersHandlers(db: CoreDb) {
  return {
    get: ({ query }: Req['get']) =>
      runHttp(() => {
        const email = extractUserEmailFromUri(query.uri);
        const user = usersService.getUser(db, email);
        if (!user) throw new NotFoundError('user', query.uri);
        return { status: 200 as const, body: { data: { uri: query.uri } } };
      }),
  };
}
