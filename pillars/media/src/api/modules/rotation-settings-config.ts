/**
 * Rotation settings read/save logic (api-layer).
 *
 * Maps the wire-shaped settings names to their `rotation_settings` keys, reads
 * them with defaults for unset keys, and writes the provided subset. Ported
 * from the monolith `rotation-config-router.ts`, repointed off `core/settings`
 * onto the pillar-owned kv table.
 */
import { type MediaDb, rotationSettingsService } from '../../db/index.js';

/** Each rotation setting: its kv key and its string default. */
export const ROTATION_SETTING_KEYS = {
  enabled: { key: 'rotation_enabled', default: '' },
  cronExpression: { key: 'rotation_cron_expression', default: '0 3 * * *' },
  targetFreeGb: { key: 'rotation_target_free_gb', default: '100' },
  leavingDays: { key: 'rotation_leaving_days', default: '7' },
  dailyAdditions: { key: 'rotation_daily_additions', default: '2' },
  avgMovieGb: { key: 'rotation_avg_movie_gb', default: '15' },
  protectedDays: { key: 'rotation_protected_days', default: '30' },
} as const satisfies Record<string, { key: string; default: string }>;

export type RotationSettingName = keyof typeof ROTATION_SETTING_KEYS;

export type RotationSettings = Record<RotationSettingName, string>;

/** The full wire input the save endpoint accepts (all fields optional). */
export interface SaveSettingsInput {
  enabled?: boolean;
  cronExpression?: string;
  targetFreeGb?: number;
  leavingDays?: number;
  dailyAdditions?: number;
  avgMovieGb?: number;
  protectedDays?: number;
}

/** Read all rotation settings, falling back to defaults for unset keys. */
export function getRotationSettings(db: MediaDb): RotationSettings {
  const keys = Object.values(ROTATION_SETTING_KEYS).map((d) => d.key);
  const stored = rotationSettingsService.getMany(db, keys);
  const result = {} as RotationSettings;
  for (const name of Object.keys(ROTATION_SETTING_KEYS) as RotationSettingName[]) {
    const def = ROTATION_SETTING_KEYS[name];
    result[name] = stored[def.key] ?? def.default;
  }
  return result;
}

function encodeBoolean(value: boolean): string {
  return value ? 'true' : '';
}

/** Per-field encoders: each maps the wire value to its stored string form. */
const ENCODERS: {
  [K in RotationSettingName]: (input: SaveSettingsInput) => string | undefined;
} = {
  enabled: (i) => (i.enabled === undefined ? undefined : encodeBoolean(i.enabled)),
  cronExpression: (i) => i.cronExpression,
  targetFreeGb: (i) => (i.targetFreeGb === undefined ? undefined : String(i.targetFreeGb)),
  leavingDays: (i) => (i.leavingDays === undefined ? undefined : String(i.leavingDays)),
  dailyAdditions: (i) => (i.dailyAdditions === undefined ? undefined : String(i.dailyAdditions)),
  avgMovieGb: (i) => (i.avgMovieGb === undefined ? undefined : String(i.avgMovieGb)),
  protectedDays: (i) => (i.protectedDays === undefined ? undefined : String(i.protectedDays)),
};

/** Persist the provided settings subset. Returns the number of keys written. */
export function saveRotationSettings(db: MediaDb, input: SaveSettingsInput): number {
  const entries: { key: string; value: string }[] = [];
  for (const name of Object.keys(ROTATION_SETTING_KEYS) as RotationSettingName[]) {
    const value = ENCODERS[name](input);
    if (value !== undefined) entries.push({ key: ROTATION_SETTING_KEYS[name].key, value });
  }
  rotationSettingsService.setMany(db, entries);
  return entries.length;
}
