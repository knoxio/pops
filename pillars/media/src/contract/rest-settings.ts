/**
 * `settings.*` sub-router — media's own federated Read/Update/Reset surface,
 * served via the shared `@pops/pillar-settings` contract factory
 * (settings-federation S2; see `docs/plans/02-settings-federation.md`).
 *
 * Media owns its `plex_*`/`rotation_*`/`radarr_*`/`sonarr_*`/`media.*` keys in
 * its OWN database. The `:key` enum is derived from media's OWN manifests
 * (`deriveKeySet([...mediaManifests])`), NOT the central settings enum — the
 * manifests are the single key authority for this pillar. The factory mounts the
 * byte-identical federated surface every pillar serves
 * (`list`/`get`/`getMany`/`set`/`setMany`/`resetKey`/`reset`/`ensure`).
 *
 * Unlike the other pillars, media's handlers back this surface onto three
 * physical tables via a translation adapter (`db/services/settings-adapter.ts`),
 * not the shared single-table service: `plex_*`/`rotation_*` keep their existing
 * carve-out tables and `'true'`/`''` boolean encoding.
 *
 * Media trusts the docker network and declares no 401 surface, so the contract
 * reuses the pillar's existing `{400,404,409}` error set; an unknown setting key
 * is mapped to a 400 by the handler.
 */
import { keyValuesFor, makeSettingsContract } from '@pops/pillar-settings';

import { ERR_RESPONSES } from './rest-schemas.js';
import { mediaKeyDefaults } from './settings/key-defaults.js';

const mediaKeyValues = keyValuesFor(mediaKeyDefaults);

export const mediaSettingsContract = makeSettingsContract(mediaKeyValues, ERR_RESPONSES);
