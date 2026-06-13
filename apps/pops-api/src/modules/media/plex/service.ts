/**
 * Plex sync service — orchestrates importing movies and TV shows
 * from a Plex Media Server into the local library, and syncs watch history.
 */
import { createCipheriv, createDecipheriv, randomBytes, randomUUID, scryptSync } from 'node:crypto';

import { settingsService } from '@pops/core-db';

import { getCoreDrizzle } from '../../../db.js';
import { getEnv } from '../../../env.js';
import { SETTINGS_KEYS } from '../../core/settings/keys.js';
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

// ---------------------------------------------------------------------------
// Token encryption
// ---------------------------------------------------------------------------

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const envKey = getEnv('ENCRYPTION_KEY');
  if (envKey) {
    return scryptSync(envKey, 'pops-plex-token', 32);
  }
  const coreDb = getCoreDrizzle();
  const existing = settingsService.getSettingOrNull(coreDb, SETTINGS_KEYS.PLEX_ENCRYPTION_SEED);
  if (existing) {
    return scryptSync(existing.value, 'pops-plex-token', 32);
  }
  const seed = randomBytes(32).toString('hex');
  const persisted = settingsService.setRawSetting(coreDb, SETTINGS_KEYS.PLEX_ENCRYPTION_SEED, seed);
  return scryptSync(persisted.value, 'pops-plex-token', 32);
}

export function encryptToken(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

export function decryptToken(ciphertext: string): string {
  const key = getEncryptionKey();
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

export function getPlexClientId(): string {
  const coreDb = getCoreDrizzle();
  const existing = settingsService.getSettingOrNull(coreDb, SETTINGS_KEYS.PLEX_CLIENT_IDENTIFIER);
  if (existing) return existing.value;

  const newId = randomUUID();
  console.warn(`[Plex] Generating new client identifier: ${newId}`);
  const persisted = settingsService.setRawSetting(
    coreDb,
    SETTINGS_KEYS.PLEX_CLIENT_IDENTIFIER,
    newId
  );
  return persisted.value;
}

export function getPlexUrl(): string | null {
  const record = settingsService.getSettingOrNull(getCoreDrizzle(), SETTINGS_KEYS.PLEX_URL);
  if (record?.value) return record.value;
  return getEnv('PLEX_URL') ?? null;
}

export function getPlexClient(): PlexClient | null {
  const url = getPlexUrl();
  if (!url) {
    console.warn('[Plex] PLEX_URL not set in settings or environment');
    return null;
  }

  const tokenRecord = settingsService.getSettingOrNull(getCoreDrizzle(), SETTINGS_KEYS.PLEX_TOKEN);
  const encryptedToken = tokenRecord?.value;

  if (!encryptedToken) {
    console.warn('[Plex] No plex_token found in settings table');
    return null;
  }

  try {
    const token = decryptToken(encryptedToken);
    return new PlexClient(url, token);
  } catch {
    console.warn('[Plex] Failed to decrypt token — trying raw value (legacy).');
    return new PlexClient(url, encryptedToken);
  }
}

/** Get the decrypted Plex token (for cloud API calls that don't use PlexClient). */
export function getPlexToken(): string | null {
  const tokenRecord = settingsService.getSettingOrNull(getCoreDrizzle(), SETTINGS_KEYS.PLEX_TOKEN);
  const encryptedToken = tokenRecord?.value;
  if (!encryptedToken) return null;

  try {
    return decryptToken(encryptedToken);
  } catch {
    return encryptedToken; // Legacy unencrypted fallback
  }
}

export function getPlexUsername(): string | null {
  const record = settingsService.getSettingOrNull(getCoreDrizzle(), SETTINGS_KEYS.PLEX_USERNAME);
  return record?.value ?? null;
}

// ---------------------------------------------------------------------------
// Section ID settings
// ---------------------------------------------------------------------------

export interface PlexSectionIds {
  movieSectionId: string | null;
  tvSectionId: string | null;
}

export function getPlexSectionIds(): PlexSectionIds {
  const coreDb = getCoreDrizzle();
  const movieRecord = settingsService.getSettingOrNull(coreDb, SETTINGS_KEYS.PLEX_MOVIE_SECTION_ID);
  const tvRecord = settingsService.getSettingOrNull(coreDb, SETTINGS_KEYS.PLEX_TV_SECTION_ID);
  return {
    movieSectionId: movieRecord?.value ?? null,
    tvSectionId: tvRecord?.value ?? null,
  };
}

export function savePlexSectionIds(movieSectionId?: string, tvSectionId?: string): void {
  const coreDb = getCoreDrizzle();
  if (movieSectionId) {
    settingsService.setRawSetting(coreDb, SETTINGS_KEYS.PLEX_MOVIE_SECTION_ID, movieSectionId);
  }
  if (tvSectionId) {
    settingsService.setRawSetting(coreDb, SETTINGS_KEYS.PLEX_TV_SECTION_ID, tvSectionId);
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

export function getSyncStatus(client: PlexClient | null): PlexSyncStatus {
  const token = settingsService.getSettingOrNull(getCoreDrizzle(), SETTINGS_KEYS.PLEX_TOKEN);
  const url = getPlexUrl();

  return {
    configured: client !== null,
    hasUrl: !!url,
    hasToken: !!token,
    connected: false,
  };
}
