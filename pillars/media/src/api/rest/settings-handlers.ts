/**
 * Handlers for media's `settings.*` sub-router (settings-federation S2, OD-2).
 *
 * Unlike the other federated pillars, media does NOT delegate to the shared
 * `@pops/pillar-settings` single-table service. Its keys back onto THREE
 * physical tables (`plex_settings`, `rotation_settings`, and the residual
 * `settings` table) with `'true'`/`''` boolean encoding, so the read/write
 * logic runs through media's `settings-adapter`. The shared package still owns
 * the redaction sentinel, the declared-key error, and the `KeyDefaults` shape;
 * only the storage layer is media-specific.
 *
 * READ paths (`list`/`get`/`getMany`) redact sensitive keys (`plex_token`,
 * `radarr_api_key`, `sonarr_api_key`) to the `__redacted__` sentinel; WRITE and
 * RESET paths persist and return real values, and reject undeclared keys
 * (`UnknownSettingKeyError` → 400 `ValidationError`) so a batch write can never
 * become a backdoor create.
 *
 * Media trusts the docker network and runs no per-request auth (parity with
 * every other media route), so there is no principal to gate against.
 */
import {
  redactSensitive,
  redactSensitiveMap,
  UnknownSettingKeyError,
  type SettingEntry,
} from '@pops/pillar-settings';

import { mediaKeyDefaults } from '../../contract/settings/key-defaults.js';
import { type MediaDb } from '../../db/index.js';
import * as adapter from '../../db/services/settings-adapter.js';
import { ValidationError } from '../shared/errors.js';
import { runHttp } from './error-mapping.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { mediaSettingsContract } from '../../contract/rest-settings.js';

type Req = ServerInferRequest<typeof mediaSettingsContract>;

const SENSITIVE = new Set(mediaKeyDefaults.sensitive);
const DECLARED = new Set(mediaKeyDefaults.keys);

function assertDeclared(keys: readonly string[]): void {
  const unknown = keys.filter((key) => !DECLARED.has(key));
  if (unknown.length > 0) throw new UnknownSettingKeyError(unknown);
}

/**
 * Runs a handler body, remapping the shared package's
 * {@link UnknownSettingKeyError} to a 400 `ValidationError` (the shared error is
 * not a media `HttpError`, so `runHttp` would otherwise re-throw it as a 500).
 */
function runSettings<T extends { status: number; body: unknown }>(
  fn: () => T
): ReturnType<typeof runHttp<T>> {
  return runHttp(() => {
    try {
      return fn();
    } catch (err) {
      if (err instanceof UnknownSettingKeyError) throw new ValidationError(err.message);
      throw err;
    }
  });
}

export function makeSettingsHandlers(db: MediaDb) {
  return {
    list: () =>
      runSettings(() => ({
        status: 200 as const,
        body: { data: redactSensitive(adapter.listEffective(db, mediaKeyDefaults), SENSITIVE) },
      })),

    get: ({ params }: Req['get']) =>
      runSettings(() => {
        const row = adapter.getOrNull(db, params.key);
        if (row === null) return { status: 200 as const, body: { data: null } };
        const [redacted] = redactSensitive([row], SENSITIVE);
        return { status: 200 as const, body: { data: redacted ?? row } };
      }),

    getMany: ({ body }: Req['getMany']) =>
      runSettings(() => ({
        status: 200 as const,
        body: { settings: redactSensitiveMap(adapter.getBulk(db, body.keys), SENSITIVE) },
      })),

    set: ({ params, body }: Req['set']) =>
      runSettings(() => {
        assertDeclared([params.key]);
        return {
          status: 200 as const,
          body: { data: adapter.setRaw(db, params.key, body.value), message: 'Setting saved' },
        };
      }),

    setMany: ({ body }: Req['setMany']) =>
      runSettings(() => {
        const entries: SettingEntry[] = body.entries;
        assertDeclared(entries.map((entry) => entry.key));
        return { status: 200 as const, body: { settings: adapter.setBulk(db, entries) } };
      }),

    resetKey: ({ params }: Req['resetKey']) =>
      runSettings(() => {
        assertDeclared([params.key]);
        return {
          status: 200 as const,
          body: {
            data: adapter.resetSetting(db, params.key, mediaKeyDefaults),
            message: 'Setting reset to default',
          },
        };
      }),

    reset: ({ body }: Req['reset']) =>
      runSettings(() => {
        const result = adapter.resetSettings(db, body.keys, mediaKeyDefaults);
        return {
          status: 200 as const,
          body: { reset: [...result.reset], settings: { ...result.settings } },
        };
      }),

    ensure: ({ params, body }: Req['ensure']) =>
      runSettings(() => ({
        status: 200 as const,
        body: { data: adapter.ensure(db, params.key, body.value) },
      })),
  };
}
