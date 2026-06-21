/**
 * `@pops/pillar-settings` — the shared, storage-agnostic Read/Update/Reset
 * settings module every pillar mounts to serve a byte-identical
 * `/settings/*` surface (settings-federation, US-S0; see
 * `docs/plans/02-settings-federation.md`).
 *
 * The module owns the schema (drizzle table factory), the RU+reset+seed
 * service, the ts-rest contract factory, read-side sensitive redaction,
 * and `deriveKeySet` (manifest → key authority). Each pillar injects its
 * own persistence handle and identity gate — the module binds to no
 * specific database and imports no pillar code.
 *
 * Protocol is READ + UPDATE + RESET only. There is no create verb and no
 * delete verb; keys are a fixed declared set per pillar. The `ensure`
 * write-once seed is internal-only.
 */
export { settingsTable, type SettingRow, type SettingsDb } from './schema.js';

export {
  deriveKeySet,
  type DeclaredSettingsField,
  type DeclaredSettingsGroup,
  type DeclaredSettingsManifest,
  type KeyDefaults,
} from './manifest-keys.js';

export { REDACTED, redactSensitive, redactSensitiveMap } from './redact.js';

export { UnknownSettingKeyError } from './errors.js';

export {
  ensure,
  getBulk,
  getOrNull,
  listEffective,
  resetSetting,
  resetSettings,
  setBulk,
  setRaw,
  type ResetResult,
  type SettingEntry,
} from './service.js';

export {
  makeSettingsContract,
  SettingSchema,
  type ContractErrorResponses,
  type SettingsContract,
} from './contract.js';

export {
  makeSettingsHandlers,
  type SettingsGate,
  type SettingsHandlerDeps,
  type SettingsHandlers,
} from './handlers.js';
