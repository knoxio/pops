/**
 * Global, non-pillar-namespaced settings keys.
 *
 * Pillar-namespaced keys (`plex_*`, `media.*`, `finance.*`, `cerebrum.*`,
 * `ego.*`, `ai.*`, `core.*`, `inventory.*`) are no longer declared here —
 * each pillar's settings manifest is now the single authority for its own
 * keys (the federated `@pops/pillar-settings` surface derives the wire enum
 * from `deriveKeySet(manifests)`). Only truly global keys with no owning
 * pillar remain.
 *
 * @deprecated The central key enum is being retired in favour of per-pillar
 * manifests. This shim survives only for the settings-federation rollout
 * window so consumers that still import `SETTINGS_KEYS`/`SETTINGS_KEY_VALUES`
 * keep compiling. Read a key's authority from its owning pillar's manifest
 * instead.
 */
export const SETTINGS_KEYS = {
  // App
  THEME: 'theme',
} as const;

/**
 * @deprecated Per-pillar settings manifests are the authority for a pillar's
 * keys. Retained for the settings-federation rollout window only.
 */
export type SettingsKey = (typeof SETTINGS_KEYS)[keyof typeof SETTINGS_KEYS];

/**
 * All valid global settings key values as an array — used for `z.enum()`
 * validation of the non-pillar-namespaced surface.
 *
 * @deprecated Pillars derive their `:key` enum from their own manifests via
 * `deriveKeySet`/`keyValuesFor`. Retained for the rollout window only.
 */
export const SETTINGS_KEY_VALUES = Object.values(SETTINGS_KEYS) as [SettingsKey, ...SettingsKey[]];
