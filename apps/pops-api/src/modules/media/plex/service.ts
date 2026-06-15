/**
 * Plex sync service — orchestrates importing movies and TV shows
 * from a Plex Media Server into the local library, and syncs watch history.
 */
import { createCipheriv, createDecipheriv, randomBytes, randomUUID, scryptSync } from 'node:crypto';

import { pillar } from '@pops/pillar-sdk/server';

import { getEnv } from '../../../env.js';
import { SETTINGS_KEYS, type SettingsKey } from '../../core/settings/keys.js';
import { PlexClient } from './client.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PlexSyncStatus {
  configured: boolean;
  hasUrl: boolean;
  hasToken: boolean;
  connected: boolean;
}

type CoreSettingsShape = {
  settings: {
    get: (input: { key: SettingsKey }) => { data: { key: string; value: string } | null };
    set: (input: { key: SettingsKey; value: string }) => {
      data: { key: string; value: string };
      message: string;
    };
    ensure: (input: { key: SettingsKey; value: string }) => {
      data: { key: string; value: string };
    };
    getMany: (input: { keys: string[] }) => { settings: Record<string, string> };
  };
};

function core(): ReturnType<typeof pillar<CoreSettingsShape>> {
  return pillar<CoreSettingsShape>('core');
}

// ---------------------------------------------------------------------------
// Token encryption
// ---------------------------------------------------------------------------

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

async function getEncryptionKey(): Promise<Buffer> {
  const envKey = getEnv('ENCRYPTION_KEY');
  if (envKey) {
    return scryptSync(envKey, 'pops-plex-token', 32);
  }
  const { data: existing } = await core().settings.get.orThrow({
    key: SETTINGS_KEYS.PLEX_ENCRYPTION_SEED,
  });
  if (existing) {
    return scryptSync(existing.value, 'pops-plex-token', 32);
  }
  const seed = randomBytes(32).toString('hex');
  const { data: persisted } = await core().settings.ensure.orThrow({
    key: SETTINGS_KEYS.PLEX_ENCRYPTION_SEED,
    value: seed,
  });
  return scryptSync(persisted.value, 'pops-plex-token', 32);
}

export async function encryptToken(plaintext: string): Promise<string> {
  const key = await getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

export async function decryptToken(ciphertext: string): Promise<string> {
  const key = await getEncryptionKey();
  const buf = Buffer.from(ciphertext, 'base64');
  const iv = buf.subarray(0, IV_LENGTH);
  const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const encrypted = buf.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(encrypted, undefined, 'utf8') + decipher.final('utf8');
}

// ---------------------------------------------------------------------------
// Client factory
// ---------------------------------------------------------------------------

export async function getPlexClientId(): Promise<string> {
  const { data: existing } = await core().settings.get.orThrow({
    key: SETTINGS_KEYS.PLEX_CLIENT_IDENTIFIER,
  });
  if (existing) return existing.value;

  const newId = randomUUID();
  console.warn(`[Plex] Generating new client identifier: ${newId}`);
  const { data: persisted } = await core().settings.ensure.orThrow({
    key: SETTINGS_KEYS.PLEX_CLIENT_IDENTIFIER,
    value: newId,
  });
  return persisted.value;
}

export async function getPlexUrl(): Promise<string | null> {
  const { data } = await core().settings.get.orThrow({ key: SETTINGS_KEYS.PLEX_URL });
  if (data?.value) return data.value;
  return getEnv('PLEX_URL') ?? null;
}

const PLEX_CLIENT_KEYS = [SETTINGS_KEYS.PLEX_URL, SETTINGS_KEYS.PLEX_TOKEN] as const;

export async function getPlexClient(): Promise<PlexClient | null> {
  const { settings } = await core().settings.getMany.orThrow({ keys: [...PLEX_CLIENT_KEYS] });
  const url = settings[SETTINGS_KEYS.PLEX_URL] ?? getEnv('PLEX_URL') ?? null;
  if (!url) {
    console.warn('[Plex] PLEX_URL not set in settings or environment');
    return null;
  }

  const encryptedToken = settings[SETTINGS_KEYS.PLEX_TOKEN];
  if (!encryptedToken) {
    console.warn('[Plex] No plex_token found in settings table');
    return null;
  }

  try {
    const token = await decryptToken(encryptedToken);
    return new PlexClient(url, token);
  } catch {
    console.warn('[Plex] Failed to decrypt token — trying raw value (legacy).');
    return new PlexClient(url, encryptedToken);
  }
}

/** Get the decrypted Plex token (for cloud API calls that don't use PlexClient). */
export async function getPlexToken(): Promise<string | null> {
  const { data } = await core().settings.get.orThrow({ key: SETTINGS_KEYS.PLEX_TOKEN });
  const encryptedToken = data?.value;
  if (!encryptedToken) return null;

  try {
    return await decryptToken(encryptedToken);
  } catch {
    return encryptedToken; // Legacy unencrypted fallback
  }
}

export async function getPlexUsername(): Promise<string | null> {
  const { data } = await core().settings.get.orThrow({ key: SETTINGS_KEYS.PLEX_USERNAME });
  return data?.value ?? null;
}

// ---------------------------------------------------------------------------
// Section ID settings
// ---------------------------------------------------------------------------

export interface PlexSectionIds {
  movieSectionId: string | null;
  tvSectionId: string | null;
}

const PLEX_SECTION_KEYS = [
  SETTINGS_KEYS.PLEX_MOVIE_SECTION_ID,
  SETTINGS_KEYS.PLEX_TV_SECTION_ID,
] as const;

export async function getPlexSectionIds(): Promise<PlexSectionIds> {
  const { settings } = await core().settings.getMany.orThrow({ keys: [...PLEX_SECTION_KEYS] });
  return {
    movieSectionId: settings[SETTINGS_KEYS.PLEX_MOVIE_SECTION_ID] ?? null,
    tvSectionId: settings[SETTINGS_KEYS.PLEX_TV_SECTION_ID] ?? null,
  };
}

export async function savePlexSectionIds(
  movieSectionId?: string,
  tvSectionId?: string
): Promise<void> {
  if (movieSectionId) {
    await core().settings.set.orThrow({
      key: SETTINGS_KEYS.PLEX_MOVIE_SECTION_ID,
      value: movieSectionId,
    });
  }
  if (tvSectionId) {
    await core().settings.set.orThrow({
      key: SETTINGS_KEYS.PLEX_TV_SECTION_ID,
      value: tvSectionId,
    });
  }
}

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

export async function testConnection(client: PlexClient): Promise<boolean> {
  try {
    await client.getLibraries();
    return true;
  } catch {
    return false;
  }
}

export async function getSyncStatus(client: PlexClient | null): Promise<PlexSyncStatus> {
  const { settings } = await core().settings.getMany.orThrow({ keys: [...PLEX_CLIENT_KEYS] });
  const url = settings[SETTINGS_KEYS.PLEX_URL] ?? getEnv('PLEX_URL') ?? null;
  const token = settings[SETTINGS_KEYS.PLEX_TOKEN];

  return {
    configured: client !== null,
    hasUrl: !!url,
    hasToken: !!token,
    connected: false,
  };
}
