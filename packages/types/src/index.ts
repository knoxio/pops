/**
 * @pops/types — Shared cross-package type definitions for POPS.
 */

export type {
  MatchType,
  Query,
  SearchAdapter,
  SearchContext,
  SearchHit,
  StructuredFilter,
} from './search.js';
export { SETTINGS_KEY_VALUES, SETTINGS_KEYS, type SettingsKey } from './settings-keys.js';
export type {
  SettingsField,
  SettingsFieldType,
  SettingsGroup,
  SettingsManifest,
} from './settings-manifest.js';
