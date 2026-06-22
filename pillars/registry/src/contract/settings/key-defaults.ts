/**
 * Core's settings key authority for the shared `@pops/pillar-settings`
 * surface (settings-federation S1).
 *
 * `deriveKeySet([aiConfigManifest, coreOperationalManifest])` is the source
 * of reset defaults and the read-side sensitive set. Its declared-key list,
 * however, is NOT yet the wire enum: shrinking core's `:key` enum to the
 * manifest-only set is the later S4 node. For S1 the wire enum (and the
 * handler's declared-key assertion) stays the full central
 * `SETTINGS_KEY_VALUES`, preserving the live cross-pillar surface that finance
 * reads (`PLEX_URL`, `PLEX_TOKEN`, …) and the `core-settings-sdk-itest`.
 *
 * So `keys` is pinned to the central enum here while `defaults`/`sensitive`
 * are enriched from core's manifests — a single `KeyDefaults` the contract
 * factory and the handler factory both consume.
 */
import { deriveKeySet, type KeyDefaults } from '@pops/pillar-settings';
import { SETTINGS_KEY_VALUES } from '@pops/types';

import { aiConfigManifest, coreOperationalManifest } from './index.js';

const manifestKeySet = deriveKeySet([aiConfigManifest, coreOperationalManifest]);

/**
 * Core's effective {@link KeyDefaults}: the full central key enum (S1
 * wire-compat) with manifest-derived defaults and sensitive flags.
 */
export const coreKeyDefaults: KeyDefaults = {
  keys: SETTINGS_KEY_VALUES,
  defaults: manifestKeySet.defaults,
  sensitive: manifestKeySet.sensitive,
};
