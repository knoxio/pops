/**
 * Resolve the numeric rotation-cycle policy from the `rotation_settings` kv
 * table (api-layer). Reuses the wire-shaped {@link getRotationSettings} reader
 * (which already applies defaults for unset keys) and coerces the string
 * values to the numbers the cycle math expects, re-defaulting any non-finite
 * parse so a corrupt row can never NaN-poison the cycle.
 */
import { type MediaDb } from '../../db/index.js';
import { getRotationSettings, ROTATION_SETTING_KEYS } from './rotation-settings-config.js';

export interface RotationCyclePolicy {
  targetFreeGb: number;
  leavingDays: number;
  dailyAdditions: number;
  avgMovieGb: number;
}

function num(value: string, fallback: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number(fallback);
}

/** Read the numeric cycle policy (target free GB, leaving days, daily cap, avg GB). */
export function getRotationCyclePolicy(db: MediaDb): RotationCyclePolicy {
  const settings = getRotationSettings(db);
  return {
    targetFreeGb: num(settings.targetFreeGb, ROTATION_SETTING_KEYS.targetFreeGb.default),
    leavingDays: num(settings.leavingDays, ROTATION_SETTING_KEYS.leavingDays.default),
    dailyAdditions: num(settings.dailyAdditions, ROTATION_SETTING_KEYS.dailyAdditions.default),
    avgMovieGb: num(settings.avgMovieGb, ROTATION_SETTING_KEYS.avgMovieGb.default),
  };
}
