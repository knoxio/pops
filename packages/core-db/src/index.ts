/**
 * Backend-safe barrel for the core domain's persistence layer.
 *
 * Hosts cross-cutting platform tables that every other pillar depends on
 * (service accounts, settings, AI Ops, pillar registry). Extracted from
 * `apps/pops-api/src/modules/core/` as the pilot for ADR-026.
 *
 * Per the CI-never-breaks pattern the migration is incremental — this PR
 * scaffolds the package and moves only the `service-accounts` slice. The
 * other slices (settings, AI Ops, URI dispatcher, pillars registry) follow
 * in subsequent PRs.
 */
export * from './errors.js';
export * from './schema.js';

export type { CoreDb } from './services/internal.js';

export { openCoreDb, type OpenedCoreDb } from './open-core-db.js';

export * as serviceAccountsService from './services/service-accounts.js';
export * as serviceAccountKeys from './services/service-account-keys.js';
export * as pillarRegistryService from './services/pillar-registry.js';
export * as settingsService from './services/settings.js';
export * as aiUsageService from './services/ai-usage.js';

export type {
  ApplyStatusUpdate,
  HeartbeatResult,
  PersistableManifest,
  PillarRegistration,
  PillarStatus,
  StatusTransition,
  UpsertPillarRegistrationInput,
} from './services/pillar-registry.js';

// Public types — re-exported at the package root so consumers can name
// them without reaching into the namespaces.
export type {
  AuthenticatedServiceAccount,
  CreateServiceAccountInput,
  CreatedServiceAccount,
  ServiceAccount,
} from './services/service-accounts.js';

export type { IssuedKey } from './services/service-account-keys.js';

export type {
  Setting,
  SetSettingInput,
  SettingListResult,
  SettingRow,
} from './services/settings.js';

export type {
  AiBudget,
  AiBudgetInsert,
  AiBudgetRow,
  AiInferenceDaily,
  AiInferenceDailyRow,
  AiInferenceLog,
  AiInferenceLogInsert,
  AiInferenceLogRow,
  CreateInferenceLogInput,
  InferenceDailyAggregate,
  InferenceLogRetentionRow,
  ListInferenceLogsFilter,
  UpsertBudgetInput,
} from './services/ai-usage.js';
