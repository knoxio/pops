/**
 * Public `Row`/`Insert` aliases for the registry-owned tables.
 *
 * Centralised here so consumers can `import type { EntityRow } from
 * '@pops/registry'` without reaching into a service module. The
 * underlying tables live in `./schema/*.ts`.
 *
 * Service-owned types (`SettingRow`, etc.) live in their respective
 * service modules and are re-exported via `./index.ts`. This file hosts
 * the remaining inferred row aliases.
 */
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';

import type { environments, userSettings } from './schema.js';

export type EnvironmentRow = InferSelectModel<typeof environments>;
export type EnvironmentInsert = InferInsertModel<typeof environments>;

export type UserSettingRow = InferSelectModel<typeof userSettings>;
export type UserSettingInsert = InferInsertModel<typeof userSettings>;
