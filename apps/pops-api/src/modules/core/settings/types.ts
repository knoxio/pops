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
