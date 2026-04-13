/**
 * Plex sync service — orchestrates importing movies and TV shows
 * from a Plex Media Server into the local library, and syncs watch history.
 */
import { createCipheriv, createDecipheriv, randomBytes, randomUUID, scryptSync } from 'node:crypto';

import { settings } from '@pops/db-types';
import { eq } from 'drizzle-orm';

import { getDrizzle } from '../../../db.js';
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
  const db = getDrizzle();
  const record = db
    .select()
    .from(settings)
    .where(eq(settings.key, SETTINGS_KEYS.PLEX_ENCRYPTION_SEED))
    .get();
  if (record) {
    return scryptSync(record.value, 'pops-plex-token', 32);
  }
  const seed = randomBytes(32).toString('hex');
  db.insert(settings)
    .values({ key: SETTINGS_KEYS.PLEX_ENCRYPTION_SEED, value: seed })
    .onConflictDoNothing()
    .run();
  const finalRecord = db
    .select()
    .from(settings)
    .where(eq(settings.key, SETTINGS_KEYS.PLEX_ENCRYPTION_SEED))
    .get();
  return scryptSync(finalRecord?.value ?? seed, 'pops-plex-token', 32);
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
  const db = getDrizzle();
  const record = db
    .select()
    .from(settings)
    .where(eq(settings.key, SETTINGS_KEYS.PLEX_CLIENT_IDENTIFIER))
    .get();
  if (!record) {
    const newId = randomUUID();
    console.warn(`[Plex] Generating new client identifier: ${newId}`);
    db.insert(settings)
      .values({ key: SETTINGS_KEYS.PLEX_CLIENT_IDENTIFIER, value: newId })
      .onConflictDoNothing()
      .run();
    const finalRecord = db
      .select()
      .from(settings)
      .where(eq(settings.key, SETTINGS_KEYS.PLEX_CLIENT_IDENTIFIER))
      .get();
    return finalRecord?.value ?? newId;
  }
  return record.value;
}

export function getPlexUrl(): string | null {
  const db = getDrizzle();
  const record = db.select().from(settings).where(eq(settings.key, SETTINGS_KEYS.PLEX_URL)).get();
  if (record?.value) return record.value;
  return getEnv('PLEX_URL') || null;
}

export function getPlexClient(): PlexClient | null {
  const url = getPlexUrl();
  if (!url) {
    console.warn('[Plex] PLEX_URL not set in settings or environment');
    return null;
  }

  const db = getDrizzle();
  const tokenRecord = db
    .select()
    .from(settings)
    .where(eq(settings.key, SETTINGS_KEYS.PLEX_TOKEN))
    .get();
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
  const db = getDrizzle();
  const tokenRecord = db
    .select()
    .from(settings)
    .where(eq(settings.key, SETTINGS_KEYS.PLEX_TOKEN))
    .get();
  const encryptedToken = tokenRecord?.value;
  if (!encryptedToken) return null;

  try {
    return decryptToken(encryptedToken);
  } catch {
    return encryptedToken; // Legacy unencrypted fallback
  }
}

export function getPlexUsername(): string | null {
  const db = getDrizzle();
  const record = db
    .select()
    .from(settings)
    .where(eq(settings.key, SETTINGS_KEYS.PLEX_USERNAME))
    .get();
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
  const db = getDrizzle();
  const movieRecord = db
    .select()
    .from(settings)
    .where(eq(settings.key, SETTINGS_KEYS.PLEX_MOVIE_SECTION_ID))
    .get();
  const tvRecord = db
    .select()
    .from(settings)
    .where(eq(settings.key, SETTINGS_KEYS.PLEX_TV_SECTION_ID))
    .get();
  return {
    movieSectionId: movieRecord?.value ?? null,
    tvSectionId: tvRecord?.value ?? null,
  };
}

export function savePlexSectionIds(movieSectionId?: string, tvSectionId?: string): void {
  const db = getDrizzle();
  if (movieSectionId) {
    db.insert(settings)
      .values({ key: SETTINGS_KEYS.PLEX_MOVIE_SECTION_ID, value: movieSectionId })
      .onConflictDoUpdate({ target: settings.key, set: { value: movieSectionId } })
      .run();
  }
  if (tvSectionId) {
    db.insert(settings)
      .values({ key: SETTINGS_KEYS.PLEX_TV_SECTION_ID, value: tvSectionId })
      .onConflictDoUpdate({ target: settings.key, set: { value: tvSectionId } })
      .run();
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
  const db = getDrizzle();
  const token = db.select().from(settings).where(eq(settings.key, SETTINGS_KEYS.PLEX_TOKEN)).get();
  const url = getPlexUrl();

  return {
    configured: client !== null,
    hasUrl: !!url,
    hasToken: !!token,
    connected: false,
  };
}
