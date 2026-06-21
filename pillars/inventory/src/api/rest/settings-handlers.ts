/**
 * Handlers for inventory's `settings.*` sub-router, delegating to the shared
 * `@pops/pillar-settings` Read/Update/Reset service (settings-federation S2).
 *
 * The shared `makeSettingsHandlers` owns the RU+reset logic, the declared-key
 * assertion, and read-side sensitive redaction. Inventory injects its
 * `InventoryDb` settings store, the `inventory.settings` scope prefix, and a
 * NO-OP gate: the inventory pillar trusts the docker network and runs no
 * per-request auth (parity with every other inventory route), so there is no
 * principal to enforce a scope against.
 *
 * `UnknownSettingKeyError` (a free-form `setMany`/`set` addressing an undeclared
 * key) is remapped to the pillar's `ValidationError` so `runHttp` returns a 400
 * rather than letting it escape as a 500.
 */
import {
  makeSettingsHandlers as makeSharedSettingsHandlers,
  UnknownSettingKeyError,
  type SettingsGate,
} from '@pops/pillar-settings';

import { inventoryKeyDefaults } from '../../contract/settings/key-defaults.js';
import { type InventoryDb } from '../../db/index.js';
import { ValidationError } from '../shared/errors.js';
import { runHttp } from './error-mapping.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { inventorySettingsContract } from '../../contract/rest-settings.js';

type Req = ServerInferRequest<typeof inventorySettingsContract>;

const SCOPE_PREFIX = 'inventory.settings';

/** Inventory runs no per-request auth, so the gate is a no-op. */
const gate: SettingsGate<unknown> = () => {};

/**
 * Runs a handler body, remapping the shared package's
 * {@link UnknownSettingKeyError} to a 400 `ValidationError` (the shared error is
 * not an inventory `HttpError`, so `runHttp` would otherwise re-throw it as a
 * 500).
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

export function makeSettingsHandlers(db: InventoryDb) {
  const shared = makeSharedSettingsHandlers<unknown>({
    db,
    scopePrefix: SCOPE_PREFIX,
    keyDefaults: inventoryKeyDefaults,
    gate,
  });

  return {
    list: () => runSettings(() => ({ status: 200 as const, body: shared.list(undefined) })),

    get: ({ params }: Req['get']) =>
      runSettings(() => ({ status: 200 as const, body: shared.get(undefined, params.key) })),

    getMany: ({ body }: Req['getMany']) =>
      runSettings(() => ({ status: 200 as const, body: shared.getMany(undefined, body.keys) })),

    set: ({ params, body }: Req['set']) =>
      runSettings(() => ({
        status: 200 as const,
        body: shared.set(undefined, params.key, body.value),
      })),

    setMany: ({ body }: Req['setMany']) =>
      runSettings(() => ({ status: 200 as const, body: shared.setMany(undefined, body.entries) })),

    resetKey: ({ params }: Req['resetKey']) =>
      runSettings(() => ({ status: 200 as const, body: shared.resetKey(undefined, params.key) })),

    reset: ({ body }: Req['reset']) =>
      runSettings(() => {
        const result = shared.reset(undefined, body.keys);
        return {
          status: 200 as const,
          body: { reset: [...result.reset], settings: { ...result.settings } },
        };
      }),

    ensure: ({ params, body }: Req['ensure']) =>
      runSettings(() => ({
        status: 200 as const,
        body: shared.ensure(undefined, params.key, body.value),
      })),
  };
}
