import { eq } from 'drizzle-orm';

import { settings } from '@pops/db-types';

import { getDrizzle } from '../../../db.js';
import { getEnv } from '../../../env.js';
import { SETTINGS_KEYS, type SettingsKey } from '../../core/settings/keys.js';
import { RadarrClient } from './radarr-client.js';
import { SonarrClient } from './sonarr-client.js';

import type { ArrConfig } from './types.js';

export interface ArrSettings {
  radarrUrl: string | null;
  radarrApiKey: string | null;
  sonarrUrl: string | null;
  sonarrApiKey: string | null;
}

export interface ArrSettingsUpdate {
  radarrUrl?: string;
  radarrApiKey?: string;
  sonarrUrl?: string;
  sonarrApiKey?: string;
}

function getSetting(key: SettingsKey): string | null {
  const db = getDrizzle();
  const record = db.select().from(settings).where(eq(settings.key, key)).get();
  if (record?.value) return record.value;
  return null;
}

export function getArrSetting(key: SettingsKey, envName: string): string | null {
  return getSetting(key) ?? getEnv(envName) ?? null;
}

function saveSetting(key: SettingsKey, value: string): void {
  const db = getDrizzle();
  db.insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } })
    .run();
}

function deleteSetting(key: SettingsKey): void {
  const db = getDrizzle();
  db.delete(settings).where(eq(settings.key, key)).run();
}

function applySetting(key: SettingsKey, value: string | undefined): void {
  if (value === undefined) return;
  if (value) saveSetting(key, value);
  else deleteSetting(key);
}

/** Get current Arr settings (from settings table or env vars). */
export function getArrSettings(): ArrSettings {
  return {
    radarrUrl: getArrSetting(SETTINGS_KEYS.RADARR_URL, 'RADARR_URL'),
    radarrApiKey: getArrSetting(SETTINGS_KEYS.RADARR_API_KEY, 'RADARR_API_KEY'),
    sonarrUrl: getArrSetting(SETTINGS_KEYS.SONARR_URL, 'SONARR_URL'),
    sonarrApiKey: getArrSetting(SETTINGS_KEYS.SONARR_API_KEY, 'SONARR_API_KEY'),
  };
}

/** Save Arr settings to the settings table. */
export function saveArrSettings(config: ArrSettingsUpdate): void {
  applySetting(SETTINGS_KEYS.RADARR_URL, config.radarrUrl);
  applySetting(SETTINGS_KEYS.RADARR_API_KEY, config.radarrApiKey);
  applySetting(SETTINGS_KEYS.SONARR_URL, config.sonarrUrl);
  applySetting(SETTINGS_KEYS.SONARR_API_KEY, config.sonarrApiKey);
}

/** Create a Radarr client if configured (settings table or env vars). */
export function getRadarrClient(): RadarrClient | null {
  const url = getArrSetting(SETTINGS_KEYS.RADARR_URL, 'RADARR_URL');
  const key = getArrSetting(SETTINGS_KEYS.RADARR_API_KEY, 'RADARR_API_KEY');
  if (!url || !key) return null;
  return new RadarrClient(url, key);
}

/** Create a Sonarr client if configured (settings table or env vars). */
export function getSonarrClient(): SonarrClient | null {
  const url = getArrSetting(SETTINGS_KEYS.SONARR_URL, 'SONARR_URL');
  const key = getArrSetting(SETTINGS_KEYS.SONARR_API_KEY, 'SONARR_API_KEY');
  if (!url || !key) return null;
  return new SonarrClient(url, key);
}

/** Get configuration state for both services. */
export function getArrConfig(): ArrConfig {
  const s = getArrSettings();
  return {
    radarrConfigured: !!(s.radarrUrl && s.radarrApiKey),
    sonarrConfigured: !!(s.sonarrUrl && s.sonarrApiKey),
  };
}
