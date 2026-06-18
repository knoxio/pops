import { z } from 'zod';

/**
 * Zod schemas for the `core.settings.*` cross-pillar SDK procedures.
 *
 * PRD-247 US-01 — foundational schema + types. These schemas declare the
 * wire shape that `pops-core-api`'s `coreRouter.settings.*` will mount in
 * a follow-up US, and that the typed `pillar<CoreRouter>('core').settings.*`
 * proxy resolves to.
 *
 * Six procedures: `get`, `set`, `ensure`, `delete`, `getMany`, `setMany`.
 *
 * Design points (per PRD-247 README "Wire shape"):
 *
 * - `getMany` returns `Record<string, string>` with missing keys omitted
 *   (NOT `null`-valued). Caller treats absence as "not set". Designed-in
 *   from US-01 because hot Plex paths batch-read 3–4 settings per call;
 *   N round-trips would regress p99 latency.
 * - `ensure` returns the persisted row (upsert-and-return). Caller cannot
 *   tell from the return value whether insert or no-op ran.
 * - `setMany` is transactional — all-or-nothing.
 * - Single-key procs (`get`, `set`, `ensure`, `delete`) constrain `key`
 *   to `SETTINGS_KEY_VALUES` (matches the in-monolith router). `getMany`
 *   and `setMany` accept `z.string()` keys (matches the existing
 *   `getBulkSettings`/`setBulkSettings` service-layer shape).
 */
import { SETTINGS_KEY_VALUES } from '@pops/types';

import { SettingSchema } from './setting.js';

export const SettingsGetInputSchema = z.object({
  key: z.enum(SETTINGS_KEY_VALUES),
});

export const SettingsGetOutputSchema = z.object({
  data: SettingSchema.nullable(),
});

export const SettingsSetInputSchema = z.object({
  key: z.enum(SETTINGS_KEY_VALUES),
  value: z.string(),
});

export const SettingsSetOutputSchema = z.object({
  data: SettingSchema,
  message: z.string(),
});

export const SettingsEnsureInputSchema = z.object({
  key: z.enum(SETTINGS_KEY_VALUES),
  value: z.string(),
});

export const SettingsEnsureOutputSchema = z.object({
  data: SettingSchema,
});

export const SettingsDeleteInputSchema = z.object({
  key: z.enum(SETTINGS_KEY_VALUES),
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
