/**
 * `service-accounts.*` sub-router — the admin CLI/MCP surface.
 *
 *   - `list`   (query)            → `GET  /service-accounts`
 *   - `create` (mutation, body)   → `POST /service-accounts`
 *   - `revoke` (mutation, `{id}`) → `POST /service-accounts/:id/revoke`
 *
 * `revoke` carries its `id` in the path (it is a single-resource action). Every
 * route is `userOnly`: the handlers gate on `requireUser`, which rejects
 * service-account principals unconditionally (a machine principal must never
 * mint or revoke other machine principals), hence `401` in the response set.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { AUTH_ERR_RESPONSES, NonEmptyString } from './rest-schemas.js';
import {
  CreatedServiceAccountSchema,
  CreateServiceAccountInputSchema,
  ServiceAccountAdminSchema,
} from './schemas/index.js';

const c = initContract();

export const coreServiceAccountsContract = c.router({
  list: {
    method: 'GET',
    path: '/service-accounts',
    responses: {
      200: z.array(ServiceAccountAdminSchema),
      ...AUTH_ERR_RESPONSES,
    },
    summary: 'List service accounts (admin only)',
  },
  create: {
    method: 'POST',
    path: '/service-accounts',
    body: CreateServiceAccountInputSchema,
    responses: {
      201: CreatedServiceAccountSchema,
      ...AUTH_ERR_RESPONSES,
    },
    summary: 'Mint a service account and return its one-time plaintext key (admin only)',
  },
  revoke: {
    method: 'POST',
    path: '/service-accounts/:id/revoke',
    pathParams: z.object({ id: NonEmptyString }),
    body: z.object({}).optional(),
    responses: {
      200: z.object({ ok: z.literal(true) }),
      ...AUTH_ERR_RESPONSES,
    },
    summary: 'Revoke a service account by id (admin only)',
  },
});
