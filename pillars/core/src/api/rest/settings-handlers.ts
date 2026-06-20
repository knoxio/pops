/**
 * Handlers for the `settings.*` sub-router (PRD-247 cross-pillar primitive).
 *
 * Every route is identity-gated (`protected`): the handler resolves the
 * principal the identity middleware stashed on `res.locals` and runs
 * `requireProtected` against the SAME scope path the tRPC `protectedProcedure`
 * used (`core.settings.<proc>`), so a service account needs the identical
 * scope grant on both wire surfaces. The gate runs INSIDE `runHttp`, so the
 * `UnauthorizedError` it throws is mapped to a 401 envelope.
 *
 * The settings semantics are inherited verbatim from `settingsService`:
 *   - `getMany` returns `Record<string,string>` with missing keys omitted.
 *   - `setMany` is transactional (all-or-nothing) via `setBulkSettings`.
 *   - `delete` 404s a missing key (translated from `SettingNotFoundError`).
 */
import { SettingNotFoundError, type CoreDb, settingsService } from '../../db/index.js';
import { readPrincipal, requireProtected } from '../middleware/identity.js';
import { NotFoundError } from '../shared/errors.js';
import { runHttp } from './error-mapping.js';

import type { ServerInferRequest } from '@ts-rest/core';
import type { Response } from 'express';

import type { coreSettingsContract } from '../../contract/rest-settings.js';

type Req = ServerInferRequest<typeof coreSettingsContract>;

const SCOPE_PREFIX = 'core.settings';

function toWireSetting(row: { key: string; value: string }): { key: string; value: string } {
  return { key: row.key, value: row.value };
}

export function makeSettingsHandlers(db: CoreDb) {
  return {
    get: ({ params, res }: Req['get'] & { res: Response }) =>
      runHttp(() => {
        requireProtected(readPrincipal(res), `${SCOPE_PREFIX}.get`);
        const row = settingsService.getSettingOrNull(db, params.key);
        return { status: 200 as const, body: { data: row ? toWireSetting(row) : null } };
      }),

    getMany: ({ body, res }: Req['getMany'] & { res: Response }) =>
      runHttp(() => {
        requireProtected(readPrincipal(res), `${SCOPE_PREFIX}.getMany`);
        return {
          status: 200 as const,
          body: { settings: settingsService.getBulkSettings(db, body.keys) },
        };
      }),

    set: ({ params, body, res }: Req['set'] & { res: Response }) =>
      runHttp(() => {
        requireProtected(readPrincipal(res), `${SCOPE_PREFIX}.set`);
        const row = settingsService.setRawSetting(db, params.key, body.value);
        return {
          status: 200 as const,
          body: { data: toWireSetting(row), message: 'Setting saved' },
        };
      }),

    ensure: ({ params, body, res }: Req['ensure'] & { res: Response }) =>
      runHttp(() => {
        requireProtected(readPrincipal(res), `${SCOPE_PREFIX}.ensure`);
        const row = settingsService.ensureSetting(db, params.key, body.value);
        return { status: 200 as const, body: { data: toWireSetting(row) } };
      }),

    delete: ({ params, res }: Req['delete'] & { res: Response }) =>
      runHttp(() => {
        requireProtected(readPrincipal(res), `${SCOPE_PREFIX}.delete`);
        try {
          settingsService.deleteSetting(db, params.key);
        } catch (err) {
          if (err instanceof SettingNotFoundError) {
            throw new NotFoundError('Setting', err.key);
          }
          throw err;
        }
        return { status: 200 as const, body: { message: 'Setting deleted' } };
      }),

    setMany: ({ body, res }: Req['setMany'] & { res: Response }) =>
      runHttp(() => {
        requireProtected(readPrincipal(res), `${SCOPE_PREFIX}.setMany`);
        return {
          status: 200 as const,
          body: { settings: settingsService.setBulkSettings(db, body.entries) },
        };
      }),
  };
}
