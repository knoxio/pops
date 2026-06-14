/**
 * `@pops/pillar-sdk/settings` — settings UI manifest discovery surface
 * (PRD-240 / ADR-037).
 *
 * Settings is the fourth registry-driven manifest dimension, peer of
 * `searchAdapters` / `aiTools` / `sinks`. `discoverSettings()` walks the
 * live discovery snapshot and returns the flattened per-pillar
 * contributions; `findSettingsManifest()` is the by-id lookup that
 * replaces the legacy named-import pattern.
 *
 * The named re-exports below (`financeManifest`, `cerebrumManifest`, …)
 * are the still-extant migration shim. Consumers migrate to the
 * discovery surface in PRD-240 US-04; the static barrel body is deleted
 * in US-05.
 */
export {
  discoverSettings,
  findSettingsManifest,
  type DiscoverSettingsOptions,
  type SettingsDiscoverySource,
} from './discover-settings.js';

export { aiConfigManifest, coreOperationalManifest } from '@pops/core-contract/settings';
export { cerebrumManifest, egoManifest } from '@pops/cerebrum-contract/settings';
export { financeManifest } from '@pops/finance-contract/settings';
export { inventoryManifest } from '@pops/inventory-contract/settings';
export {
  arrManifest,
  plexManifest,
  rotationManifest,
  mediaOperationalManifest,
} from '@pops/media-contract/settings';
