/**
 * Unit tests for the Plex token crypto + key-derivation precedence.
 *
 * Real AES-256-GCM (no mock) against a fresh on-disk `plex_settings`
 * table, so the encrypt → decrypt round-trip and the
 * env-key / stored-seed / generated-seed precedence are exercised exactly
 * as production would run them.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openMediaDb, plexSettingsService, type OpenedMediaDb } from '../../../../db/index.js';
import { decryptToken, encryptToken, getEncryptionKey } from '../crypto.js';

let tmpDir: string;
let opened: OpenedMediaDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'media-plex-crypto-test-'));
  opened = openMediaDb(join(tmpDir, 'media.db'));
  delete process.env['ENCRYPTION_KEY'];
});

afterEach(() => {
  opened.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
  delete process.env['ENCRYPTION_KEY'];
});

describe('plex token crypto', () => {
  it('round-trips a token via a generated, persisted seed', () => {
    const db = opened.db;
    const cipher = encryptToken(db, 'plex-secret');
    expect(cipher).not.toContain('plex-secret');
    expect(decryptToken(db, cipher)).toBe('plex-secret');

    const seed = plexSettingsService.getSetting(db, 'plex_encryption_seed');
    expect(seed).not.toBeNull();
  });

  it('reuses the persisted seed across separate db handles', () => {
    const cipher = encryptToken(opened.db, 'persist-me');
    opened.raw.close();

    const reopened = openMediaDb(join(tmpDir, 'media.db'));
    try {
      expect(decryptToken(reopened.db, cipher)).toBe('persist-me');
    } finally {
      reopened.raw.close();
    }
    opened = openMediaDb(join(tmpDir, 'media.db'));
  });

  it('prefers ENCRYPTION_KEY over a stored seed', () => {
    process.env['ENCRYPTION_KEY'] = 'env-secret-key';
    const envKey = getEncryptionKey(opened.db);
    expect(plexSettingsService.getSetting(opened.db, 'plex_encryption_seed')).toBeNull();

    const cipher = encryptToken(opened.db, 'env-keyed');
    expect(decryptToken(opened.db, cipher)).toBe('env-keyed');

    delete process.env['ENCRYPTION_KEY'];
    const generatedKey = getEncryptionKey(opened.db);
    expect(generatedKey.equals(envKey)).toBe(false);
  });

  it('fails to decrypt a tampered ciphertext (GCM tag check)', () => {
    const db = opened.db;
    const cipher = encryptToken(db, 'tamper-target');
    const buf = Buffer.from(cipher, 'base64');
    buf[buf.length - 1] ^= 0xff;
    const tampered = buf.toString('base64');
    expect(() => decryptToken(db, tampered)).toThrow();
  });
});
