/**
 * Feature-toggle module for the core pillar (epic 05 / S1).
 *
 * Service layer only — the ts-rest contract + handlers (S2) and the shell
 * conversion (S5) are tracked separately. Feature declarations are sourced
 * from the live registry snapshot (each pillar's manifest `features` slot),
 * never a static pillar list.
 */
export {
  clearUserPreference,
  FeatureGateError,
  FeatureNotFoundError,
  FeatureScopeError,
  getFeatureManifests,
  isEnabled,
  listFeatures,
  setFeatureEnabled,
  setUserPreference,
  type CapabilityProbes,
  type FeatureServiceOptions,
  type UserContext,
} from './service.js';
export type { RegistryFeatureView, ResolutionContext } from './resolution.js';
export {
  buildSettingsFieldIndex,
  resolveCredentials,
  type ResolvedCredentials,
  type SettingsFieldIndex,
} from './credentials.js';
export {
  FeatureCredentialStatusSchema,
  FeatureDefinitionSchema,
  FeatureManifestSchema,
  FeatureScopeSchema,
  FeatureStatusSchema,
} from './types.js';
