import { z } from 'zod';

/**
 * Wire schemas for the cross-pillar settings SDK procedures.
 *
 * Invariants the Zod types alone don't convey:
 *
 * - `getMany` returns `Record<string, string>` with missing keys omitted
 *   (NOT `null`-valued); a caller treats absence as "not set". Batch read
 *   exists so hot paths fetch several settings in one round-trip instead of
 *   N calls.
 * - `ensure` returns the persisted row (upsert-and-return); the return value
 *   does not reveal whether an insert or a no-op ran.
 * - `setMany` is transactional — all-or-nothing.
 * - Single-key procs (`get`, `set`, `ensure`, `delete`) constrain `key` to
 *   the registry's own manifest key set (derived from `coreOperationalManifest`).
 *   `getMany` and `setMany` accept `z.string()` keys, matching the
 *   `getBulkSettings`/`setBulkSettings` service-layer shape.
 */
import { deriveKeySet, keyValuesFor } from '@pops/pillar-settings';

import { coreOperationalManifest } from '../settings/index.js';
import { SettingSchema } from './setting.js';

const registryKeyValues = keyValuesFor(deriveKeySet([coreOperationalManifest]));

export const SettingsGetInputSchema = z.object({
  key: z.enum(registryKeyValues),
});

export const SettingsGetOutputSchema = z.object({
  data: SettingSchema.nullable(),
});

export const SettingsSetInputSchema = z.object({
  key: z.enum(registryKeyValues),
  value: z.string(),
});

export const SettingsSetOutputSchema = z.object({
  data: SettingSchema,
  message: z.string(),
});

export const SettingsEnsureInputSchema = z.object({
  key: z.enum(registryKeyValues),
  value: z.string(),
});

export const SettingsEnsureOutputSchema = z.object({
  data: SettingSchema,
});

export const SettingsDeleteInputSchema = z.object({
  key: z.enum(registryKeyValues),
});

export const SettingsDeleteOutputSchema = z.object({
  message: z.string(),
});

export const SettingsGetManyInputSchema = z.object({
  keys: z.array(z.string()),
});

export const SettingsGetManyOutputSchema = z.object({
  settings: z.record(z.string(), z.string()),
});

export const SettingsSetManyInputSchema = z.object({
  entries: z.array(
    z.object({
      key: z.string(),
      value: z.string(),
    })
  ),
});

export const SettingsSetManyOutputSchema = z.object({
  settings: z.record(z.string(), z.string()),
});
