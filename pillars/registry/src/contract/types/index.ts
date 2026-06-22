/**
 * Public entity types for the core pillar. Hand-maintained — adding
 * a new entity means adding both a file under `types/` and a matching
 * schema under `schemas/`. The round-trip test enforces that they agree.
 */
export type { Pillar, PillarStatus } from './pillar.js';
export type { RegistryEntry } from './registry-entry.js';
export type { ServiceAccount } from './service-account.js';
export type { Setting } from './setting.js';
export type {
  SettingsDeleteInput,
  SettingsDeleteOutput,
  SettingsEnsureInput,
  SettingsEnsureOutput,
  SettingsGetInput,
  SettingsGetManyInput,
  SettingsGetManyOutput,
  SettingsGetOutput,
  SettingsSetInput,
  SettingsSetManyInput,
  SettingsSetManyOutput,
  SettingsSetOutput,
} from './settings-procedures.js';
