/**
 * `settings.*` sub-router — finance's own federated Read/Update/Reset surface,
 * served via the shared `@pops/pillar-settings` contract factory
 * (settings-federation S2; see `docs/plans/02-settings-federation.md`).
 *
 * Finance owns its `finance.*` keys in its own DB. The `:key` enum is derived
 * from finance's OWN manifest (`deriveKeySet([financeManifest])`), NOT the
 * central settings enum — the manifest is the single key authority for this
 * pillar. The factory mounts the byte-identical federated surface every pillar
 * serves (`list`/`get`/`getMany`/`set`/`setMany`/`resetKey`/`reset`/`ensure`).
 *
 * Finance trusts the docker network and declares no 401 surface, so the
 * contract reuses the pillar's existing `{400,404,409}` error set; an unknown
 * setting key is mapped to a 400 by the handler.
 */
import { keyValuesFor, makeSettingsContract } from '@pops/pillar-settings';

import { ERR_RESPONSES } from './rest-schemas.js';
import { financeKeyDefaults } from './settings/key-defaults.js';

const financeKeyValues = keyValuesFor(financeKeyDefaults);

export const financeSettingsContract = makeSettingsContract(financeKeyValues, ERR_RESPONSES);
