import { pillar } from '@pops/pillar-sdk/server';

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

type CoreSettingsShape = {
  settings: {
    get: (input: { key: SettingsKey }) => { data: { key: string; value: string } | null };
    set: (input: { key: SettingsKey; value: string }) => {
      data: { key: string; value: string };
      message: string;
    };
    delete: (input: { key: SettingsKey }) => { message: string };
    getMany: (input: { keys: string[] }) => { settings: Record<string, string> };
  };
};

function core(): ReturnType<typeof pillar<CoreSettingsShape>> {
  return pillar<CoreSettingsShape>('core');
}

function isNotFoundError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const data = (err as { data?: { code?: string } }).data;
  return data?.code === 'NOT_FOUND';
}

async function saveSetting(key: SettingsKey, value: string): Promise<void> {
  await core().settings.set.orThrow({ key, value });
}

async function deleteSetting(key: SettingsKey): Promise<void> {
  try {
    await core().settings.delete.orThrow({ key });
  } catch (err) {
    if (!isNotFoundError(err)) throw err;
  }
}

async function applySetting(key: SettingsKey, value: string | undefined): Promise<void> {
  if (value === undefined) return;
  if (value) await saveSetting(key, value);
  else await deleteSetting(key);
}

const ARR_KEYS = [
  SETTINGS_KEYS.RADARR_URL,
  SETTINGS_KEYS.RADARR_API_KEY,
  SETTINGS_KEYS.SONARR_URL,
  SETTINGS_KEYS.SONARR_API_KEY,
] as const;

function resolve(stored: Record<string, string>, key: SettingsKey, envName: string): string | null {
  return stored[key] ?? getEnv(envName) ?? null;
}

export async function getArrSetting(key: SettingsKey, envName: string): Promise<string | null> {
  const { data } = await core().settings.get.orThrow({ key });
  return data?.value ?? getEnv(envName) ?? null;
}

/** Get current Arr settings (from settings table or env vars). */
export async function getArrSettings(): Promise<ArrSettings> {
  const { settings } = await core().settings.getMany.orThrow({ keys: [...ARR_KEYS] });
  return {
    radarrUrl: resolve(settings, SETTINGS_KEYS.RADARR_URL, 'RADARR_URL'),
    radarrApiKey: resolve(settings, SETTINGS_KEYS.RADARR_API_KEY, 'RADARR_API_KEY'),
    sonarrUrl: resolve(settings, SETTINGS_KEYS.SONARR_URL, 'SONARR_URL'),
    sonarrApiKey: resolve(settings, SETTINGS_KEYS.SONARR_API_KEY, 'SONARR_API_KEY'),
  };
}

/** Save Arr settings to the settings table. */
export async function saveArrSettings(config: ArrSettingsUpdate): Promise<void> {
  await applySetting(SETTINGS_KEYS.RADARR_URL, config.radarrUrl);
  await applySetting(SETTINGS_KEYS.RADARR_API_KEY, config.radarrApiKey);
  await applySetting(SETTINGS_KEYS.SONARR_URL, config.sonarrUrl);
  await applySetting(SETTINGS_KEYS.SONARR_API_KEY, config.sonarrApiKey);
}

/** Create a Radarr client if configured (settings table or env vars). */
export async function getRadarrClient(): Promise<RadarrClient | null> {
  const s = await getArrSettings();
  if (!s.radarrUrl || !s.radarrApiKey) return null;
  return new RadarrClient(s.radarrUrl, s.radarrApiKey);
}

/** Create a Sonarr client if configured (settings table or env vars). */
export async function getSonarrClient(): Promise<SonarrClient | null> {
  const s = await getArrSettings();
  if (!s.sonarrUrl || !s.sonarrApiKey) return null;
  return new SonarrClient(s.sonarrUrl, s.sonarrApiKey);
}

/** Get configuration state for both services. */
export async function getArrConfig(): Promise<ArrConfig> {
  const s = await getArrSettings();
  return {
    radarrConfigured: !!(s.radarrUrl && s.radarrApiKey),
    sonarrConfigured: !!(s.sonarrUrl && s.sonarrApiKey),
  };
}
