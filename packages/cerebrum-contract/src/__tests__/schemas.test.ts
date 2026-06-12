import { describe, expect, expectTypeOf, it } from 'vitest';

import { CerebrumErrorSchema } from '../errors.js';
import { EngramSchema } from '../schemas/engram.js';

import type { z } from 'zod';

import type { CerebrumError } from '../errors.js';
import type { Engram } from '../types/engram.js';

describe('@pops/cerebrum-contract round-trip', () => {
  it('Engram ↔ EngramSchema agree structurally', () => {
    expectTypeOf<z.infer<typeof EngramSchema>>().toEqualTypeOf<Engram>();
  });

  it('CerebrumError ↔ CerebrumErrorSchema agree structurally', () => {
    expectTypeOf<z.infer<typeof CerebrumErrorSchema>>().toEqualTypeOf<CerebrumError>();
  });

  it('EngramSchema accepts a well-formed payload', () => {
    const payload: Engram = {
      id: 'eng_1',
      content: 'Remember to refactor the dispatcher.',
      lastEditedTime: '2026-06-12T00:00:00.000Z',
    };

    expect(EngramSchema.parse(payload)).toEqual(payload);
  });

  it('EngramSchema rejects a non-ISO-8601 lastEditedTime', () => {
    const bad: Engram = {
      id: 'eng_1',
      content: 'x',
      lastEditedTime: '12 June 2026',
    };

    expect(() => EngramSchema.parse(bad)).toThrow();
  });

  it('EngramSchema rejects a missing content', () => {
    const bad = {
      id: 'eng_1',
      lastEditedTime: '2026-06-12T00:00:00.000Z',
    };

    expect(() => EngramSchema.parse(bad)).toThrow();
  });

  it('EngramSchema rejects a non-string id', () => {
    const bad = {
      id: 42,
      content: 'x',
      lastEditedTime: '2026-06-12T00:00:00.000Z',
    };

    expect(() => EngramSchema.parse(bad)).toThrow();
  });

  it('CerebrumErrorSchema accepts ContractStatus envelope', () => {
    expect(CerebrumErrorSchema.parse({ kind: 'unavailable' })).toEqual({ kind: 'unavailable' });
  });

  it('CerebrumErrorSchema accepts an unknown-engram domain error', () => {
    const err: CerebrumError = { kind: 'unknown-engram', engramId: 'eng_1' };
    expect(CerebrumErrorSchema.parse(err)).toEqual(err);
  });

  it('CerebrumErrorSchema accepts an engram-archived domain error', () => {
    const err: CerebrumError = { kind: 'engram-archived', engramId: 'eng_1' };
    expect(CerebrumErrorSchema.parse(err)).toEqual(err);
  });

  it('CerebrumErrorSchema rejects an unknown kind', () => {
    expect(() => CerebrumErrorSchema.parse({ kind: 'mystery' })).toThrow();
  });
});
