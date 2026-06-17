/**
 * AES-256-GCM token crypto for the Plex auth token.
 *
 * The encryption key is derived from one of three sources, in order:
 *   1. The `ENCRYPTION_KEY` env var, stretched via `scrypt`.
 *   2. A persisted random seed in `plex_settings` (`plex_encryption_seed`),
 *      stretched via `scrypt`.
 *   3. A freshly generated seed, persisted to `plex_settings`, then
 *      stretched via `scrypt`.
 *
 * Ciphertext layout (base64-encoded): `iv (12 bytes) | tag (16 bytes) |
 * ciphertext`. This matches the monolith's wire format so tokens written
 * before the migration decrypt unchanged once the seed is carried over.
 */
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

import { type MediaDb, plexSettingsService } from '../../../db/index.js';
import { getEnv } from '../env.js';
import { PLEX_KEYS } from './keys.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const SCRYPT_SALT = 'pops-plex-token';

function deriveKey(secret: string): Buffer {
  return scryptSync(secret, SCRYPT_SALT, KEY_LENGTH);
}

/**
 * Resolve the AES key, persisting a generated seed to `plex_settings` when
 * neither the env var nor a stored seed is present.
 */
export function getEncryptionKey(db: MediaDb): Buffer {
  const envKey = getEnv('ENCRYPTION_KEY');
  if (envKey !== undefined) return deriveKey(envKey);

  const existing = plexSettingsService.getSetting(db, PLEX_KEYS.encryptionSeed);
  if (existing !== null) return deriveKey(existing);

  const seed = randomBytes(KEY_LENGTH).toString('hex');
  plexSettingsService.setSetting(db, PLEX_KEYS.encryptionSeed, seed);
  return deriveKey(seed);
}

/** Encrypt `plaintext` and return the base64 `iv|tag|ciphertext` blob. */
export function encryptToken(db: MediaDb, plaintext: string): string {
  const key = getEncryptionKey(db);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

/** Reverse {@link encryptToken}. Throws if the tag fails authentication. */
export function decryptToken(db: MediaDb, ciphertext: string): string {
  const key = getEncryptionKey(db);
  const buf = Buffer.from(ciphertext, 'base64');
  const iv = buf.subarray(0, IV_LENGTH);
  const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const encrypted = buf.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(encrypted, undefined, 'utf8') + decipher.final('utf8');
}
