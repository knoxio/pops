import { z } from 'zod';

import type { SettingRow } from '@pops/db-types';
import type { SettingsKey } from '@pops/types';

export type { SettingRow };

/** API response shape */
export interface Setting {
  key: string;
  value: string;
}

/** Map database row to API response */
export function toSetting(row: SettingRow): Setting {
  return {
    key: row.key,
    value: row.value,
  };
}

/** Zod schema for the setting response shape. */
export const SettingSchema = z.object({
  key: z.string(),
  value: z.string(),
});

/** Input for setting a value (upsert) — used internally by the service */
export interface SetSettingInput {
  key: SettingsKey;
  value: string;
}

/** Schema for list query */
export const SettingListSchema = z.object({
  search: z.string().optional(),
  limit: z.coerce.number().positive().optional(),
  offset: z.coerce.number().nonnegative().optional(),
});
export type SettingListInput = z.infer<typeof SettingListSchema>;

/** Zod schemas mirroring the SettingsManifest types from @pops/types */
export const SettingsFieldSchema = z.object({
  key: z.string(),
  label: z.string(),
  description: z.string().optional(),
  type: z.enum(['text', 'number', 'toggle', 'select', 'password', 'url', 'duration', 'json']),
  default: z.string().optional(),
  options: z.array(z.object({ value: z.string(), label: z.string() })).optional(),
  validation: z
    .object({
      required: z.boolean().optional(),
      min: z.number().optional(),
      max: z.number().optional(),
      pattern: z.string().optional(),
      message: z.string().optional(),
    })
    .optional(),
  envFallback: z.string().optional(),
  sensitive: z.boolean().optional(),
  requiresRestart: z.boolean().optional(),
  testAction: z.object({ procedure: z.string(), label: z.string() }).optional(),
});

export const SettingsGroupSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  fields: z.array(SettingsFieldSchema),
});

export const SettingsManifestSchema = z.object({
  id: z.string(),
  title: z.string(),
  icon: z.string().optional(),
  order: z.number(),
  groups: z.array(SettingsGroupSchema),
});
