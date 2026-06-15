import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Plex auth tests — token encryption, PIN handling, username storage.
 *
 * The SDK proxy `pillar('core').settings.*` is mocked against an in-memory
 * store; seed and read-back helpers use the same store so assertions see the
 * same persistence layer the production code writes through.
 */
import { setupTestContext } from '../../../shared/test-utils.js';
import { SETTINGS_KEYS } from '../../core/settings/keys.js';

import type { createCaller } from '../../../shared/test-utils.js';

const settingsStore = new Map<string, string>();

class NotFoundCallError extends Error {
  data = { code: 'NOT_FOUND' as const };
}

vi.mock('@pops/pillar-sdk/server', () => ({
  pillar: () => ({
    settings: {
      get: {
        orThrow: async ({ key }: { key: string }) => {
          const v = settingsStore.get(key);
          return { data: v === undefined ? null : { key, value: v } };
        },
      },
      getMany: {
        orThrow: async ({ keys }: { keys: string[] }) => {
          const settings: Record<string, string> = {};
          for (const k of keys) {
            const v = settingsStore.get(k);
            if (v !== undefined) settings[k] = v;
          }
          return { settings };
        },
      },
      set: {
        orThrow: async ({ key, value }: { key: string; value: string }) => {
          settingsStore.set(key, value);
          return { data: { key, value }, message: 'Setting saved' };
        },
      },
      ensure: {
        orThrow: async ({ key, value }: { key: string; value: string }) => {
          const existing = settingsStore.get(key);
          if (existing !== undefined) {
            return { data: { key, value: existing } };
          }
          settingsStore.set(key, value);
          return { data: { key, value } };
        },
      },
      delete: {
        orThrow: async ({ key }: { key: string }) => {
          if (!settingsStore.has(key)) {
            throw new NotFoundCallError(`not found: ${key}`);
          }
          settingsStore.delete(key);
          return { message: 'Setting deleted' };
        },
      },
    },
  }),
}));

const ctx = setupTestContext();
let caller: ReturnType<typeof createCaller>;

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

beforeEach(() => {
  vi.clearAllMocks();
  settingsStore.clear();
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
    const encrypted = await encryptToken(originalToken);
    expect(encrypted).not.toBe(originalToken);
    const decrypted = await decryptToken(encrypted);
    expect(decrypted).toBe(originalToken);
  });

  it('produces different ciphertext each time (random IV)', async () => {
    const { encryptToken, decryptToken } = await import('./service.js');
    const token = 'same-token';
    const a = await encryptToken(token);
    const b = await encryptToken(token);
    expect(a).not.toBe(b);
    expect(await decryptToken(a)).toBe(token);
    expect(await decryptToken(b)).toBe(token);
  });

  it('throws on tampered ciphertext', async () => {
    const { encryptToken, decryptToken } = await import('./service.js');
    const encrypted = await encryptToken('test-token');
    const tampered = encrypted.slice(0, -4) + 'XXXX';
    await expect(decryptToken(tampered)).rejects.toThrow();
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
    const storedToken = settingsStore.get(SETTINGS_KEYS.PLEX_TOKEN);
    expect(storedToken).toBeTruthy();
    expect(storedToken).not.toBe('my-plex-token');

    // Verify username is stored
    expect(settingsStore.get(SETTINGS_KEYS.PLEX_USERNAME)).toBe('plexuser');
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
    settingsStore.set(SETTINGS_KEYS.PLEX_TOKEN, 'encrypted-token');
    settingsStore.set(SETTINGS_KEYS.PLEX_USERNAME, 'plexuser');

    const result = await caller.media.plex.disconnect();
    expect(result.message).toBe('Disconnected from Plex');

    expect(settingsStore.has(SETTINGS_KEYS.PLEX_TOKEN)).toBe(false);
    expect(settingsStore.has(SETTINGS_KEYS.PLEX_USERNAME)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getPlexUsername
// ---------------------------------------------------------------------------
describe('getPlexUsername', () => {
  it('returns stored username', async () => {
    settingsStore.set(SETTINGS_KEYS.PLEX_USERNAME, 'plexuser');

    const result = await caller.media.plex.getPlexUsername();
    expect(result.data).toBe('plexuser');
  });

  it('returns null when no username stored', async () => {
    const result = await caller.media.plex.getPlexUsername();
    expect(result.data).toBeNull();
  });
});
