import { describe, expect, it, vi } from 'vitest';

import { UnknownSettingKeyError } from '../errors.js';
import { makeSettingsHandlers, type SettingsGate } from '../handlers.js';
import { REDACTED } from '../redact.js';
import { getOrNull } from '../service.js';
import { makeTestDb } from './helpers.js';

import type { KeyDefaults } from '../manifest-keys.js';

interface Principal {
  readonly scopes: readonly string[];
}

const kd: KeyDefaults = {
  keys: ['plex_url', 'plex_token', 'media.retention'],
  defaults: { 'media.retention': '30' },
  sensitive: ['plex_token'],
};

/** A real scope-checking gate — no mock, exercises the injected contract. */
const scopeGate: SettingsGate<Principal> = (principal, scope) => {
  if (!principal.scopes.includes(scope)) {
    throw new Error(`forbidden: ${scope}`);
  }
};

const ALLOW: Principal = {
  scopes: [
    'media.settings.list',
    'media.settings.get',
    'media.settings.getMany',
    'media.settings.set',
    'media.settings.setMany',
    'media.settings.resetKey',
    'media.settings.reset',
    'media.settings.ensure',
  ],
};

function setup() {
  const db = makeTestDb();
  const handlers = makeSettingsHandlers<Principal>({
    db,
    scopePrefix: 'media.settings',
    keyDefaults: kd,
    gate: scopeGate,
  });
  return { db, handlers };
}

describe('makeSettingsHandlers — gating', () => {
  it('runs the injected gate with the scoped procedure name and denies when unscoped', () => {
    const { handlers } = setup();
    const gate = vi.fn();
    const guarded = makeSettingsHandlers<Principal>({
      db: makeTestDb(),
      scopePrefix: 'media.settings',
      keyDefaults: kd,
      gate,
    });
    guarded.get(ALLOW, 'plex_url');
    expect(gate).toHaveBeenCalledWith(ALLOW, 'media.settings.get');

    expect(() => handlers.set({ scopes: [] }, 'plex_url', 'x')).toThrow(
      'forbidden: media.settings.set'
    );
  });
});

describe('makeSettingsHandlers — update + read', () => {
  it('set persists the verbatim value and get reads it back', () => {
    const { db, handlers } = setup();
    expect(handlers.set(ALLOW, 'plex_url', 'http://plex.local')).toEqual({
      data: { key: 'plex_url', value: 'http://plex.local' },
      message: 'Setting saved',
    });
    expect(handlers.get(ALLOW, 'plex_url')).toEqual({
      data: { key: 'plex_url', value: 'http://plex.local' },
    });
    expect(getOrNull(db, 'plex_url')).toEqual({ key: 'plex_url', value: 'http://plex.local' });
  });

  it('get returns null for an unset key', () => {
    const { handlers } = setup();
    expect(handlers.get(ALLOW, 'plex_url')).toEqual({ data: null });
  });

  it('list returns the effective value set, redacting sensitive keys even when unset', () => {
    const { handlers } = setup();
    handlers.set(ALLOW, 'plex_url', 'http://plex.local');
    expect(handlers.list(ALLOW)).toEqual({
      data: [
        { key: 'plex_url', value: 'http://plex.local' },
        { key: 'plex_token', value: REDACTED },
        { key: 'media.retention', value: '30' },
      ],
    });
  });

  it('setMany / getMany round-trip a batch', () => {
    const { handlers } = setup();
    handlers.setMany(ALLOW, [
      { key: 'plex_url', value: 'u' },
      { key: 'media.retention', value: '7' },
    ]);
    expect(handlers.getMany(ALLOW, ['plex_url', 'media.retention', 'missing'])).toEqual({
      settings: { plex_url: 'u', 'media.retention': '7' },
    });
  });
});

describe('makeSettingsHandlers — declared-key enforcement (no backdoor create)', () => {
  it('set rejects an undeclared key', () => {
    const { db, handlers } = setup();
    expect(() => handlers.set(ALLOW, 'totally.unknown', 'x')).toThrow(UnknownSettingKeyError);
    expect(getOrNull(db, 'totally.unknown')).toBeNull();
  });

  it('setMany rejects the whole batch when any key is undeclared and writes nothing', () => {
    const { db, handlers } = setup();
    expect(() =>
      handlers.setMany(ALLOW, [
        { key: 'plex_url', value: 'u' },
        { key: 'rogue.key', value: 'v' },
      ])
    ).toThrow(UnknownSettingKeyError);
    // validation runs before the transactional write — the declared key is untouched too
    expect(getOrNull(db, 'plex_url')).toBeNull();
  });

  it('resetKey rejects an undeclared key', () => {
    const { handlers } = setup();
    expect(() => handlers.resetKey(ALLOW, 'nope')).toThrow(UnknownSettingKeyError);
  });

  it('read paths stay lenient — getMany omits undeclared keys instead of throwing', () => {
    const { handlers } = setup();
    expect(handlers.getMany(ALLOW, ['plex_url', 'undeclared']).settings).toEqual({});
  });
});

describe('makeSettingsHandlers — redaction round-trip (GAP-256-E)', () => {
  it('reads a sensitive value back as the sentinel while the DB holds the real secret', () => {
    const { db, handlers } = setup();
    handlers.set(ALLOW, 'plex_token', 'AES-ciphertext-secret');

    expect(handlers.get(ALLOW, 'plex_token')).toEqual({
      data: { key: 'plex_token', value: REDACTED },
    });
    expect(handlers.getMany(ALLOW, ['plex_token']).settings['plex_token']).toBe(REDACTED);
    expect(handlers.list(ALLOW).data).toContainEqual({ key: 'plex_token', value: REDACTED });

    expect(getOrNull(db, 'plex_token')).toEqual({
      key: 'plex_token',
      value: 'AES-ciphertext-secret',
    });
  });

  it('never redacts the write path — the stored value is the real one', () => {
    const { db, handlers } = setup();
    const result = handlers.set(ALLOW, 'plex_token', 'real-secret');
    expect(result.data.value).toBe('real-secret');
    expect(getOrNull(db, 'plex_token')?.value).toBe('real-secret');
  });
});

describe('makeSettingsHandlers — reset', () => {
  it('resetKey reverts a single key to its default', () => {
    const { handlers } = setup();
    handlers.set(ALLOW, 'media.retention', '999');
    expect(handlers.resetKey(ALLOW, 'media.retention')).toEqual({
      data: { key: 'media.retention', value: '30' },
      message: 'Setting reset to default',
    });
  });

  it('reset reverts all declared keys when no keys are supplied', () => {
    const { handlers } = setup();
    handlers.set(ALLOW, 'media.retention', '999');
    handlers.set(ALLOW, 'plex_url', 'changed');
    const result = handlers.reset(ALLOW, undefined);
    expect(result.reset).toEqual(['plex_url', 'plex_token', 'media.retention']);
    expect(result.settings).toEqual({ plex_url: '', plex_token: '', 'media.retention': '30' });
  });
});

describe('makeSettingsHandlers — ensure (internal seed)', () => {
  it('writes once and never clobbers', () => {
    const { handlers } = setup();
    expect(handlers.ensure(ALLOW, 'plex_url', 'seed').data.value).toBe('seed');
    expect(handlers.ensure(ALLOW, 'plex_url', 'second').data.value).toBe('seed');
  });
});
