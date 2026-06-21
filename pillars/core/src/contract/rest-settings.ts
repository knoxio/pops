/**
 * `settings.*` sub-router — core's own federated Read/Update/Reset surface,
 * served via the shared `@pops/pillar-settings` contract factory
 * (settings-federation S1; see `docs/plans/02-settings-federation.md`).
 *
 * The factory mounts the byte-identical federated surface every pillar serves:
 *
 *   - `list`     → `GET    /settings`              collection (sensitive redacted)
 *   - `get`      → `GET    /settings/:key`         single (null on unset)
 *   - `getMany`  → `POST   /settings/get-many`     batch read (missing omitted)
 *   - `set`      → `PUT    /settings/:key`         upsert one declared key
 *   - `setMany`  → `POST   /settings/set-many`     transactional batch write
 *   - `resetKey` → `POST   /settings/:key/reset`   reset one key to default
 *   - `reset`    → `POST   /settings/reset`        reset declared keys
 *   - `ensure`   → `POST   /settings/:key/ensure`  internal-only write-once seed
 *
 * On top of the shared protocol, core retains the LEGACY
 * `DELETE /settings/:key` route as a rolling-deploy alias: an old shell that
 * still issues `DELETE` keeps working against this image, and the handler maps
 * it to reset-to-default (delete-override == old delete-then-default for a
 * declared key). The alias is removed in the later S5 node once metrics show
 * zero `DELETE /settings/*` traffic.
 *
 * `:key` stays constrained to the full central `SETTINGS_KEY_VALUES` for S1:
 * shrinking it to core's manifest-only key set is the S4 node, and the live
 * cross-pillar surface (`PLEX_URL`, `PLEX_TOKEN`, … that finance reads) plus
 * the `core-settings-sdk-itest` depend on the full enum here.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { makeSettingsContract } from '@pops/pillar-settings';
import { SETTINGS_KEY_VALUES } from '@pops/types';

import { AUTH_ERR_RESPONSES } from './rest-schemas.js';

const c = initContract();

const SettingKeyParam = z.object({ key: z.enum(SETTINGS_KEY_VALUES) });

const federatedSettingsContract = makeSettingsContract(SETTINGS_KEY_VALUES, AUTH_ERR_RESPONSES);

/**
 * Composed by explicit per-route reference rather than object spread: spreading
 * the factory's intersection-typed return widens the route map so
 * `ServerInferRequest` (and the ts-rest express router) collapse the per-route
 * shapes. Referencing each route preserves the discrete keys.
 */
export const coreSettingsContract = c.router({
  list: federatedSettingsContract.list,
  get: federatedSettingsContract.get,
  getMany: federatedSettingsContract.getMany,
  set: federatedSettingsContract.set,
  setMany: federatedSettingsContract.setMany,
  resetKey: federatedSettingsContract.resetKey,
  reset: federatedSettingsContract.reset,
  ensure: federatedSettingsContract.ensure,
  delete: {
    method: 'DELETE',
    path: '/settings/:key',
    pathParams: SettingKeyParam,
    body: z.object({}).optional(),
    responses: {
      200: z.object({ message: z.string() }),
      ...AUTH_ERR_RESPONSES,
    },
    summary: 'Reset a single setting to its default (legacy DELETE alias for the reset route)',
  },
});
