/**
 * Env-only configuration for the Radarr/Sonarr (*arr) clients.
 *
 * NOTE: arr config is ENV-ONLY. The monolith resolved URL + API key as
 * `settings[key] ?? env`, persisting form edits to a `core/settings` table.
 * The pillar must not depend on `core/settings` or `apps/pops-api`, and a
 * server cannot write its own env at runtime, so env is the single source of
 * truth. The settings-save UI is a Phase D / deploy-config concern; the
 * `saveSettings` mutation was intentionally dropped (no REST route exists).
 *
 * `RADARR_QUALITY_PROFILE_ID` / `RADARR_ROOT_FOLDER_PATH` supply the
 * `downloadAndProtect` rotation defaults that the monolith read from the
 * `rotation_*` settings keys.
 */
import { getEnv } from '../env.js';
import { RadarrClient } from './radarr-client.js';
import { SonarrClient } from './sonarr-client.js';

import type { ArrConfig } from './types.js';

export interface ArrSettings {
  radarrUrl: string | null;
  radarrApiKey: string | null;
  sonarrUrl: string | null;
  sonarrApiKey: string | null;
}

/** Read the env-derived arr settings. URLs/keys are `null` when unset. */
export function getArrSettings(): ArrSettings {
  return {
    radarrUrl: getEnv('RADARR_URL') ?? null,
    radarrApiKey: getEnv('RADARR_API_KEY') ?? null,
    sonarrUrl: getEnv('SONARR_URL') ?? null,
    sonarrApiKey: getEnv('SONARR_API_KEY') ?? null,
  };
}

/** Create a Radarr client if configured via env, else `null`. */
export function getRadarrClient(): RadarrClient | null {
  const s = getArrSettings();
  if (!s.radarrUrl || !s.radarrApiKey) return null;
  return new RadarrClient(s.radarrUrl, s.radarrApiKey);
}

/** Create a Sonarr client if configured via env, else `null`. */
export function getSonarrClient(): SonarrClient | null {
  const s = getArrSettings();
  if (!s.sonarrUrl || !s.sonarrApiKey) return null;
  return new SonarrClient(s.sonarrUrl, s.sonarrApiKey);
}

/** Read-only configuration state derived from env presence flags. */
export function getArrConfig(): ArrConfig {
  const s = getArrSettings();
  return {
    radarrConfigured: !!(s.radarrUrl && s.radarrApiKey),
    sonarrConfigured: !!(s.sonarrUrl && s.sonarrApiKey),
  };
}

/** Env-derived rotation defaults for `downloadAndProtect`; `null` when unset. */
export interface RotationDefaults {
  qualityProfileId: number;
  rootFolderPath: string;
}

export function getRotationDefaults(): RotationDefaults | null {
  const rawProfileId = getEnv('RADARR_QUALITY_PROFILE_ID');
  const rootFolderPath = getEnv('RADARR_ROOT_FOLDER_PATH');
  if (!rawProfileId || !rootFolderPath) return null;
  const qualityProfileId = Number(rawProfileId);
  if (!Number.isFinite(qualityProfileId)) return null;
  return { qualityProfileId, rootFolderPath };
}
