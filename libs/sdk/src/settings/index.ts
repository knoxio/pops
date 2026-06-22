/**
 * `@pops/pillar-sdk/settings` — settings UI manifest discovery surface
 * (PRD-240 / ADR-037).
 *
 * Settings is the fourth registry-driven manifest dimension, peer of
 * `searchAdapters` / `aiTools` / `sinks`. `discoverSettings()` walks the
 * live discovery snapshot and returns the flattened per-pillar
 * contributions; `findSettingsManifest()` is the by-id lookup that
 * replaces the legacy named-import pattern.
 */
export {
  discoverSettings,
  findSettingsManifest,
  type DiscoverSettingsOptions,
  type SettingsContribution,
  type SettingsDiscoverySource,
} from './discover-settings.js';
