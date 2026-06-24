import { describe, expect, expectTypeOf, it } from 'vitest';

import { CoreErrorSchema } from '../errors.js';
import { PillarSchema } from '../schemas/pillar.js';
import { RegistryEntrySchema } from '../schemas/registry-entry.js';
import { ServiceAccountSchema } from '../schemas/service-account.js';
import { SettingSchema } from '../schemas/setting.js';

import type { z } from 'zod';

import type { CoreError } from '../errors.js';
import type { Pillar } from '../types/pillar.js';
import type { RegistryEntry } from '../types/registry-entry.js';
import type { ServiceAccount } from '../types/service-account.js';
import type { Setting } from '../types/setting.js';

describe('@pops/registry contract round-trip', () => {
  it('RegistryEntry ↔ RegistryEntrySchema agree structurally', () => {
    expectTypeOf<z.infer<typeof RegistryEntrySchema>>().toEqualTypeOf<RegistryEntry>();
  });

  it('Setting ↔ SettingSchema agree structurally', () => {
    expectTypeOf<z.infer<typeof SettingSchema>>().toEqualTypeOf<Setting>();
  });

  it('ServiceAccount ↔ ServiceAccountSchema agree structurally', () => {
    expectTypeOf<z.infer<typeof ServiceAccountSchema>>().toEqualTypeOf<ServiceAccount>();
  });

  it('Pillar ↔ PillarSchema agree structurally', () => {
    expectTypeOf<z.infer<typeof PillarSchema>>().toEqualTypeOf<Pillar>();
  });

  it('CoreError ↔ CoreErrorSchema agree structurally', () => {
    expectTypeOf<z.infer<typeof CoreErrorSchema>>().toEqualTypeOf<CoreError>();
  });

  it('RegistryEntrySchema accepts a well-formed payload', () => {
    const payload: RegistryEntry = {
      pillarId: 'finance',
      baseUrl: 'https://finance.internal',
      registeredAt: '2026-06-12T00:00:00.000Z',
    };

    expect(RegistryEntrySchema.parse(payload)).toEqual(payload);
  });

  it('RegistryEntrySchema rejects a non-ISO-8601 registeredAt', () => {
    const bad: RegistryEntry = {
      pillarId: 'finance',
      baseUrl: 'https://finance.internal',
      registeredAt: '12 June 2026',
    };

    expect(() => RegistryEntrySchema.parse(bad)).toThrow();
  });

  it('RegistryEntrySchema rejects a missing baseUrl', () => {
    const bad = {
      pillarId: 'finance',
      registeredAt: '2026-06-12T00:00:00.000Z',
    };

    expect(() => RegistryEntrySchema.parse(bad)).toThrow();
  });

  it('RegistryEntrySchema rejects a non-string pillarId', () => {
    const bad = {
      pillarId: 42,
      baseUrl: 'https://finance.internal',
      registeredAt: '2026-06-12T00:00:00.000Z',
    };

    expect(() => RegistryEntrySchema.parse(bad)).toThrow();
  });

  it('SettingSchema accepts a well-formed payload', () => {
    const payload: Setting = {
      key: 'core.timezone',
      value: 'Europe/Lisbon',
    };

    expect(SettingSchema.parse(payload)).toEqual(payload);
  });

  it('SettingSchema rejects a non-string value', () => {
    const bad = {
      key: 'core.timezone',
      value: 42,
    };

    expect(() => SettingSchema.parse(bad)).toThrow();
  });

  it('SettingSchema rejects a missing key', () => {
    const bad = {
      value: 'Europe/Lisbon',
    };

    expect(() => SettingSchema.parse(bad)).toThrow();
  });

  it('SettingSchema rejects a non-string key', () => {
    const bad = {
      key: 1,
      value: 'Europe/Lisbon',
    };

    expect(() => SettingSchema.parse(bad)).toThrow();
  });

  it('ServiceAccountSchema accepts a well-formed active key', () => {
    const payload: ServiceAccount = {
      id: 'sa_01',
      name: 'finance-readonly',
      keyPrefix: 'pops_live_abcd',
      scopes: ['finance:read'],
      createdAt: '2026-06-12T00:00:00.000Z',
      lastUsedAt: '2026-06-12T01:00:00.000Z',
      revokedAt: null,
      createdBy: 'joao@example.com',
    };

    expect(ServiceAccountSchema.parse(payload)).toEqual(payload);
  });

  it('ServiceAccountSchema accepts a revoked, never-used key with no creator', () => {
    const payload: ServiceAccount = {
      id: 'sa_02',
      name: 'legacy-cron',
      keyPrefix: 'pops_live_legac',
      scopes: ['core:read', 'core:write'],
      createdAt: '2025-01-01T00:00:00.000Z',
      lastUsedAt: null,
      revokedAt: '2026-01-01T00:00:00.000Z',
      createdBy: null,
    };

    expect(ServiceAccountSchema.parse(payload)).toEqual(payload);
  });

  it('ServiceAccountSchema rejects a non-array scopes', () => {
    const bad = {
      id: 'sa_03',
      name: 'x',
      keyPrefix: 'pops_live_x',
      scopes: 'finance:read',
      createdAt: '2026-06-12T00:00:00.000Z',
      lastUsedAt: null,
      revokedAt: null,
      createdBy: null,
    };

    expect(() => ServiceAccountSchema.parse(bad)).toThrow();
  });

  it('ServiceAccountSchema rejects a non-ISO-8601 createdAt', () => {
    const bad = {
      id: 'sa_03',
      name: 'x',
      keyPrefix: 'pops_live_x',
      scopes: ['core:read'],
      createdAt: '2026-06-12',
      lastUsedAt: null,
      revokedAt: null,
      createdBy: null,
    };

    expect(() => ServiceAccountSchema.parse(bad)).toThrow();
  });

  it('ServiceAccountSchema rejects a non-string scope element', () => {
    const bad = {
      id: 'sa_03',
      name: 'x',
      keyPrefix: 'pops_live_x',
      scopes: ['core:read', 42],
      createdAt: '2026-06-12T00:00:00.000Z',
      lastUsedAt: null,
      revokedAt: null,
      createdBy: null,
    };

    expect(() => ServiceAccountSchema.parse(bad)).toThrow();
  });

  it('PillarSchema accepts a well-formed healthy pillar', () => {
    const payload: Pillar = {
      pillarId: 'finance',
      baseUrl: 'https://finance.internal',
      contractPackage: '@pops/finance-contract',
      contractVersion: '0.1.0',
      contractTag: 'finance@0.1.0',
      status: 'healthy',
      registeredAt: '2026-06-12T00:00:00.000Z',
      lastHeartbeatAt: '2026-06-12T00:00:10.000Z',
      statusUpdatedAt: '2026-06-12T00:00:00.000Z',
    };

    expect(PillarSchema.parse(payload)).toEqual(payload);
  });

  it('PillarSchema accepts an unavailable pillar', () => {
    const payload: Pillar = {
      pillarId: 'media',
      baseUrl: 'https://media.internal',
      contractPackage: '@pops/media-contract',
      contractVersion: '0.1.0',
      contractTag: 'media@0.1.0',
      status: 'unavailable',
      registeredAt: '2026-06-12T00:00:00.000Z',
      lastHeartbeatAt: '2026-06-12T00:00:00.000Z',
      statusUpdatedAt: '2026-06-12T00:01:00.000Z',
    };

    expect(PillarSchema.parse(payload)).toEqual(payload);
  });

  it('PillarSchema rejects an unknown status', () => {
    const bad = {
      pillarId: 'finance',
      baseUrl: 'https://finance.internal',
      contractPackage: '@pops/finance-contract',
      contractVersion: '0.1.0',
      contractTag: 'finance@0.1.0',
      status: 'idle',
      registeredAt: '2026-06-12T00:00:00.000Z',
      lastHeartbeatAt: '2026-06-12T00:00:10.000Z',
      statusUpdatedAt: '2026-06-12T00:00:00.000Z',
    };

    expect(() => PillarSchema.parse(bad)).toThrow();
  });

  it('PillarSchema rejects a non-ISO-8601 lastHeartbeatAt', () => {
    const bad = {
      pillarId: 'finance',
      baseUrl: 'https://finance.internal',
      contractPackage: '@pops/finance-contract',
      contractVersion: '0.1.0',
      contractTag: 'finance@0.1.0',
      status: 'healthy',
      registeredAt: '2026-06-12T00:00:00.000Z',
      lastHeartbeatAt: 'yesterday',
      statusUpdatedAt: '2026-06-12T00:00:00.000Z',
    };

    expect(() => PillarSchema.parse(bad)).toThrow();
  });

  it('PillarSchema rejects a missing contractTag', () => {
    const bad = {
      pillarId: 'finance',
      baseUrl: 'https://finance.internal',
      contractPackage: '@pops/finance-contract',
      contractVersion: '0.1.0',
      status: 'healthy',
      registeredAt: '2026-06-12T00:00:00.000Z',
      lastHeartbeatAt: '2026-06-12T00:00:10.000Z',
      statusUpdatedAt: '2026-06-12T00:00:00.000Z',
    };

    expect(() => PillarSchema.parse(bad)).toThrow();
  });

  it('CoreErrorSchema accepts ContractStatus envelope', () => {
    expect(CoreErrorSchema.parse({ kind: 'unavailable' })).toEqual({ kind: 'unavailable' });
  });

  it('CoreErrorSchema accepts an unknown-pillar domain error', () => {
    const err: CoreError = { kind: 'unknown-pillar', pillarId: 'finance' };
    expect(CoreErrorSchema.parse(err)).toEqual(err);
  });

  it('CoreErrorSchema accepts a pillar-not-registered domain error', () => {
    const err: CoreError = { kind: 'pillar-not-registered', pillarId: 'finance' };
    expect(CoreErrorSchema.parse(err)).toEqual(err);
  });

  it('CoreErrorSchema rejects an unknown kind', () => {
    expect(() => CoreErrorSchema.parse({ kind: 'mystery' })).toThrow();
  });
});
