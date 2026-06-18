/**
 * `settings.*` sub-router — the PRD-247 cross-pillar settings primitive
 * (`core.settings.*`).
 *
 * Mapping from the legacy tRPC router (semantics preserved EXACTLY):
 *   - `get`     (query,   single key)  → `GET    /settings/:key`
 *   - `getMany` (query,   key array)   → `POST   /settings/get-many`
 *   - `set`     (mutation, key+value)  → `PUT    /settings/:key`
 *   - `ensure`  (mutation, key+value)  → `POST   /settings/:key/ensure`
 *   - `delete`  (mutation, single key) → `DELETE /settings/:key`
 *   - `setMany` (mutation, entries)    → `POST   /settings/set-many`
 *
 * `getMany`/`setMany` carry arrays/objects, so they map to POST-with-body
 * rather than a path-id route. Their wire output is `Record<string,string>`
 * with **missing keys omitted** (`getMany`) and an **all-or-nothing**
 * transactional write (`setMany`) — both inherited verbatim from the
 * `settingsService` the handlers delegate to.
 *
 * Single-key routes constrain `:key` to `SETTINGS_KEY_VALUES` (matching the
 * tRPC enum input); `getMany`/`setMany` accept free-form string keys
 * (matching the service-layer bulk shape). Schemas are reused from
 * `@pops/core-contract`'s `settings-procedures` so the wire shape stays the
 * single source of truth shared with the tRPC router.
 *
 * Every route is identity-gated (`protected`): the handlers enforce the gate
 * via `requireProtected`, so `401` joins the common error set here.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { SETTINGS_KEY_VALUES } from '@pops/types';

import { AUTH_ERR_RESPONSES } from './rest-schemas.js';
import {
  SettingSchema,
  SettingsGetManyInputSchema,
  SettingsGetManyOutputSchema,
  SettingsSetManyInputSchema,
  SettingsSetManyOutputSchema,
} from './schemas/index.js';

const c = initContract();

const SettingKeyParam = z.object({ key: z.enum(SETTINGS_KEY_VALUES) });
const SettingValueBody = z.object({ value: z.string() });

export const coreSettingsContract = c.router({
  get: {
    method: 'GET',
    path: '/settings/:key',
    pathParams: SettingKeyParam,
    responses: {
      200: z.object({ data: SettingSchema.nullable() }),
      ...AUTH_ERR_RESPONSES,
    },
    summary: 'Read a single setting (null on miss)',
  },
  getMany: {
    method: 'POST',
    path: '/settings/get-many',
    body: SettingsGetManyInputSchema,
    responses: {
      200: SettingsGetManyOutputSchema,
      ...AUTH_ERR_RESPONSES,
    },
    summary: 'Batch-read settings by key (missing keys omitted)',
  },
  set: {
    method: 'PUT',
    path: '/settings/:key',
    pathParams: SettingKeyParam,
    body: SettingValueBody,
    responses: {
      200: z.object({ data: SettingSchema, message: z.string() }),
      ...AUTH_ERR_RESPONSES,
    },
    summary: 'Upsert a single setting',
  },
  ensure: {
    method: 'POST',
    path: '/settings/:key/ensure',
    pathParams: SettingKeyParam,
    body: SettingValueBody,
    responses: {
      200: z.object({ data: SettingSchema }),
      ...AUTH_ERR_RESPONSES,
    },
    summary: 'Write-once upsert-and-return for a single setting',
  },
  delete: {
    method: 'DELETE',
    path: '/settings/:key',
    pathParams: SettingKeyParam,
    body: z.object({}).optional(),
    responses: {
      200: z.object({ message: z.string() }),
      ...AUTH_ERR_RESPONSES,
    },
    summary: 'Delete a single setting (404 on miss)',
  },
  setMany: {
    method: 'POST',
    path: '/settings/set-many',
    body: SettingsSetManyInputSchema,
    responses: {
      200: SettingsSetManyOutputSchema,
      ...AUTH_ERR_RESPONSES,
    },
    summary: 'Transactional batch write (all-or-nothing); returns the written mirror',
  },
});
