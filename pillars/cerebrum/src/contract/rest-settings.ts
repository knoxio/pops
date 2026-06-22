/**
 * `settings.*` sub-router — cerebrum's own federated Read/Update/Reset surface,
 * served via the shared `@pops/pillar-settings` contract factory
 * (settings-federation S2; see `docs/plans/02-settings-federation.md`).
 *
 * Cerebrum owns its `cerebrum.*` and `ego.*` keys in its own DB. The `:key` enum
 * is derived from cerebrum's OWN manifests
 * (`deriveKeySet([cerebrumManifest, egoManifest])`), NOT the central settings
 * enum — the manifests are the single key authority for this pillar. The factory
 * mounts the byte-identical federated surface every pillar serves
 * (`list`/`get`/`getMany`/`set`/`setMany`/`resetKey`/`reset`/`ensure`).
 *
 * Cerebrum trusts the docker network and declares no 401 surface, so the
 * contract reuses the pillar's `{400,404,409}` error bodies (cerebrum has no
 * shared `ERR_RESPONSES` constant — sub-contracts declare errors inline — so the
 * map is composed here from `errorBodySchema`); an unknown setting key is mapped
 * to a 400 by the handler.
 */
import { keyValuesFor, makeSettingsContract } from '@pops/pillar-settings';

import { errorBodySchema } from './rest-schemas.js';
import { cerebrumKeyDefaults } from './settings/key-defaults.js';

const ERR_RESPONSES = {
  400: errorBodySchema,
  404: errorBodySchema,
  409: errorBodySchema,
} as const;

const cerebrumKeyValues = keyValuesFor(cerebrumKeyDefaults);

export const cerebrumSettingsContract = makeSettingsContract(cerebrumKeyValues, ERR_RESPONSES);
