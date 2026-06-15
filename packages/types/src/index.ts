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
export type {
  FeatureCredentialStatus,
  FeatureDefinition,
  FeatureManifest,
  FeatureScope,
  FeatureStatus,
} from './feature-manifest.js';
export type { Capability } from './capability.js';
export type { UriHandlerDescriptor, UriResolution, UriResolverResult } from './uri-handler.js';
export type { PillarHealth, PillarRegistryEntry } from './pillar-registry.js';
export type { AiToolDescriptor, AiToolHandler, AiToolResult } from './ai-tool.js';
export type { MigrationDescriptor } from './migration.js';
export type { SearchAdapterDescriptor } from './search-adapter.js';
export type { IngestSourceDescriptor } from './ingest-source.js';
export { assertModuleManifest } from './module-manifest.js';
export type {
  ModuleBackendManifest,
  ModuleCaptureOverlayConfig,
  ModuleFrontendManifest,
  ModuleManifest,
  ModuleOverlayConfig,
  ModuleSurface,
  OverlayComponentLoader,
} from './module-manifest.js';
