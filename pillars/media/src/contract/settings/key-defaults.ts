/**
 * Media's settings key authority for the shared `@pops/pillar-settings`
 * surface (settings-federation S2).
 *
 * `deriveKeySet([...mediaManifests])` is the single source of the declared key
 * set, the reset defaults, and the read-side sensitive set — media's own
 * manifests are the only authority for its keys (no central enum). The same
 * `KeyDefaults` feeds both the contract's `:key` enum and the settings adapter's
 * declared-key assertion + default resolution.
 *
 * Sensitive keys (`plex_token`, `radarr_api_key`, `sonarr_api_key`) are
 * redacted on read; the four manifests declare them via `sensitive: true`.
 */
import { deriveKeySet, type KeyDefaults } from '@pops/pillar-settings';

import { arrManifest, mediaOperationalManifest, plexManifest, rotationManifest } from './index.js';

/** Media's effective {@link KeyDefaults}, derived from its own manifests. */
export const mediaKeyDefaults: KeyDefaults = deriveKeySet([
  plexManifest,
  arrManifest,
  rotationManifest,
  mediaOperationalManifest,
]);
