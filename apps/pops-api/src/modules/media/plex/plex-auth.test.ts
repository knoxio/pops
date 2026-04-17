import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Plex auth tests — token encryption, PIN handling, username storage.
 */
import { settings } from '@pops/db-types';

import { getDrizzle } from '../../../db.js';
import { setupTestContext } from '../../../shared/test-utils.js';
import { SETTINGS_KEYS } from '../../core/settings/keys.js';

import type { createCaller } from '../../../shared/test-utils.js';

const ctx = setupTestContext();
let caller: ReturnType<typeof createCaller>;

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

beforeEach(() => {
  vi.clearAllMocks();
  ({ caller } = ctx.setup());
});

afterEach(() => {
  ctx.teardown();
});

// ---------------------------------------------------------------------------
// Token encryption round-trip
// ---------------------------------------------------------------------------
describe('Token encryption', () => {
  it('encrypts and decrypts a token correctly', async () => {
    const { encryptToken, decryptToken } = await import('./service.js');
    const originalToken = 'my-secret-plex-token-abc123';
    const encrypted = encryptToken(originalToken);
    expect(encrypted).not.toBe(originalToken);
    const decrypted = decryptToken(encrypted);
    expect(decrypted).toBe(originalToken);
  });

  it('produces different ciphertext each time (random IV)', async () => {
    const { encryptToken, decryptToken } = await import('./service.js');
    const token = 'same-token';
    const a = encryptToken(token);
    const b = encryptToken(token);
    expect(a).not.toBe(b);
    expect(decryptToken(a)).toBe(token);
    expect(decryptToken(b)).toBe(token);
  });

  it('throws on tampered ciphertext', async () => {
    const { encryptToken, decryptToken } = await import('./service.js');
    const encrypted = encryptToken('test-token');
    const tampered = encrypted.slice(0, -4) + 'XXXX';
    expect(() => decryptToken(tampered)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// PIN generation
// ---------------------------------------------------------------------------
describe('getAuthPin', () => {
  it('returns PIN id, code, and clientId on success', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 12345, code: 'ABCD' }),
    });

    const result = await caller.media.plex.getAuthPin();
    expect(result.data.id).toBe(12345);
    expect(result.data.code).toBe('ABCD');
    expect(result.data.clientId).toBeTruthy();
  });

  it('throws on Plex API failure', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
    await expect(caller.media.plex.getAuthPin()).rejects.toThrow(/Failed to get Plex PIN/);
  });
});

// ---------------------------------------------------------------------------
// checkAuthPin
// ---------------------------------------------------------------------------
describe('checkAuthPin', () => {
  it('stores encrypted token and username on successful auth', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        authToken: 'my-plex-token',
        username: 'plexuser',
        expiresAt: new Date(Date.now() + 300000).toISOString(),
      }),
    });

    const result = await caller.media.plex.checkAuthPin({ id: 12345 });
    expect(result.data.connected).toBe(true);
    expect(result.data.username).toBe('plexuser');

    // Verify token is stored encrypted (not plaintext)
    const drizzle = getDrizzle();
    const tokenRecord = drizzle
      .select()
      .from(settings)
      .where(eq(settings.key, SETTINGS_KEYS.PLEX_TOKEN))
      .get();
    expect(tokenRecord).toBeTruthy();
    expect(tokenRecord!.value).not.toBe('my-plex-token');

    // Verify username is stored
    const usernameRecord = drizzle
      .select()
      .from(settings)
      .where(eq(settings.key, SETTINGS_KEYS.PLEX_USERNAME))
      .get();
    expect(usernameRecord?.value).toBe('plexuser');
  });

  it('returns connected:false when PIN not yet claimed', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        authToken: null,
        expiresAt: new Date(Date.now() + 300000).toISOString(),
      }),
    });

    const result = await caller.media.plex.checkAuthPin({ id: 12345 });
    expect(result.data.connected).toBe(false);
    expect(result.data.expired).toBe(false);
  });

  it('returns expired:true when PIN has expired', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        authToken: null,
        expiresAt: new Date(Date.now() - 60000).toISOString(),
      }),
    });

    const result = await caller.media.plex.checkAuthPin({ id: 12345 });
    expect(result.data.expired).toBe(true);
  });

  it('throws NOT_FOUND for invalid PIN ID (404)', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
    await expect(caller.media.plex.checkAuthPin({ id: 99999 })).rejects.toThrow(
      /Invalid or expired PIN/
    );
  });

  it('throws for other API failures', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 503 });
    await expect(caller.media.plex.checkAuthPin({ id: 12345 })).rejects.toThrow(
      /Failed to check Plex PIN/
    );
  });
});

// ---------------------------------------------------------------------------
// disconnect
// ---------------------------------------------------------------------------
describe('disconnect', () => {
  it('removes token and username from settings', async () => {
    const drizzle = getDrizzle();

    // Seed token and username
    drizzle
      .insert(settings)
      .values({ key: SETTINGS_KEYS.PLEX_TOKEN, value: 'encrypted-token' })
      .onConflictDoUpdate({ target: settings.key, set: { value: 'encrypted-token' } })
      .run();
    drizzle
      .insert(settings)
      .values({ key: SETTINGS_KEYS.PLEX_USERNAME, value: 'plexuser' })
      .onConflictDoUpdate({ target: settings.key, set: { value: 'plexuser' } })
      .run();

    const result = await caller.media.plex.disconnect();
    expect(result.message).toBe('Disconnected from Plex');

    const tokenRecord = drizzle
      .select()
      .from(settings)
      .where(eq(settings.key, SETTINGS_KEYS.PLEX_TOKEN))
      .get();
    expect(tokenRecord).toBeUndefined();
    const usernameRecord = drizzle
      .select()
      .from(settings)
      .where(eq(settings.key, SETTINGS_KEYS.PLEX_USERNAME))
      .get();
    expect(usernameRecord).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// getPlexUsername
// ---------------------------------------------------------------------------
describe('getPlexUsername', () => {
  it('returns stored username', async () => {
    const drizzle = getDrizzle();
    drizzle.insert(settings).values({ key: SETTINGS_KEYS.PLEX_USERNAME, value: 'plexuser' }).run();

    const result = await caller.media.plex.getPlexUsername();
    expect(result.data).toBe('plexuser');
  });

  it('returns null when no username stored', async () => {
    const result = await caller.media.plex.getPlexUsername();
    expect(result.data).toBeNull();
  });
});
