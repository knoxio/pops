import type { SettingRow } from '@pops/db-types';
import { z } from 'zod';

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

/** Schema for setting a value (upsert) */
export const SetSettingSchema = z.object({
  key: z.string().min(1, 'Key is required'),
  value: z.string(),
});
export type SetSettingInput = z.infer<typeof SetSettingSchema>;

/** Schema for list query */
export const SettingListSchema = z.object({
  search: z.string().optional(),
  limit: z.coerce.number().positive().optional(),
  offset: z.coerce.number().nonnegative().optional(),
});
export type SettingListInput = z.infer<typeof SettingListSchema>;
