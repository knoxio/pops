/**
 * Handlers for the `service-accounts.*` admin sub-router.
 *
 * `userOnly` — every route gates on `requireUser`, which rejects service-
 * account principals unconditionally (a machine principal must never mint or
 * revoke other machine principals). The gate throws `UnauthorizedError` (401)
 * inside `runHttp`, so an anonymous or service-account caller bounces with a
 * 401 envelope.
 *
 * Domain errors from `@pops/core-db` are translated to local `HttpError`
 * subclasses (`ValidationError`/`NotFoundError`/`ConflictError`) and mapped to
 * 400/404/409 by `runHttp` — the same translation the tRPC router applied.
 */
import {
  type CoreDb,
  ServiceAccountAlreadyRevokedError,
  ServiceAccountNameAlreadyExistsError,
  ServiceAccountNotFoundError,
  serviceAccountsService,
} from '../../db/index.js';
import { readPrincipal, requireUser } from '../middleware/identity.js';
import { ConflictError, NotFoundError, ValidationError } from '../shared/errors.js';
import { runHttp } from './error-mapping.js';

import type { ServerInferRequest } from '@ts-rest/core';
import type { Response } from 'express';

import type { coreServiceAccountsContract } from '../../contract/rest-service-accounts.js';

type Req = ServerInferRequest<typeof coreServiceAccountsContract>;

export function makeServiceAccountsHandlers(db: CoreDb) {
  return {
    list: ({ res }: { res: Response }) =>
      runHttp(() => {
        requireUser(readPrincipal(res));
        return { status: 200 as const, body: serviceAccountsService.listServiceAccounts(db) };
      }),

    create: ({ body, res }: Req['create'] & { res: Response }) =>
      runHttp(async () => {
        const user = requireUser(readPrincipal(res));
        try {
          const created = await serviceAccountsService.createServiceAccount(db, body, user.email);
          return { status: 201 as const, body: created };
        } catch (err) {
          if (err instanceof ServiceAccountNameAlreadyExistsError) {
            throw new ValidationError({ message: err.message });
          }
          throw err;
        }
      }),

    revoke: ({ params, res }: Req['revoke'] & { res: Response }) =>
      runHttp(() => {
        requireUser(readPrincipal(res));
        try {
          serviceAccountsService.revokeServiceAccount(db, params.id);
        } catch (err) {
          if (err instanceof ServiceAccountNotFoundError) {
            throw new NotFoundError('ServiceAccount', params.id);
          }
          if (err instanceof ServiceAccountAlreadyRevokedError) {
            throw new ConflictError(err.message);
          }
          throw err;
        }
        return { status: 200 as const, body: { ok: true as const } };
      }),
  };
}
