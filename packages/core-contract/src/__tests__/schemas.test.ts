import { describe, expect, expectTypeOf, it } from 'vitest';

import { CoreErrorSchema } from '../errors.js';
import { RegistryEntrySchema } from '../schemas/registry-entry.js';

import type { z } from 'zod';

import type { CoreError } from '../errors.js';
import type { RegistryEntry } from '../types/registry-entry.js';

describe('@pops/core-contract round-trip', () => {
  it('RegistryEntry ↔ RegistryEntrySchema agree structurally', () => {
    expectTypeOf<z.infer<typeof RegistryEntrySchema>>().toEqualTypeOf<RegistryEntry>();
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
