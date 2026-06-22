import { describe, expect, it } from 'vitest';

import { PillarCallError } from '../call-result.js';
import { PILLARS } from '../known-pillar-id.js';

describe('PillarCallError', () => {
  it('encodes the cause discriminant in the message for unavailable', () => {
    const err = new PillarCallError({ kind: 'unavailable', pillar: 'finance' });
    expect(err.message).toBe("Pillar call failed: pillar 'finance' unavailable");
    expect(err.cause).toEqual({ kind: 'unavailable', pillar: 'finance' });
    expect(err.name).toBe('PillarCallError');
  });

  it('encodes the cause for degraded with reason', () => {
    const err = new PillarCallError({ kind: 'degraded', reason: 'budget-exceeded' });
    expect(err.message).toBe('Pillar call failed: degraded (budget-exceeded)');
  });

  it('encodes the cause for contract-mismatch', () => {
    const err = new PillarCallError({
      kind: 'contract-mismatch',
      expected: '1.2.3',
      actual: '0.9.0',
    });
    expect(err.message).toBe(
      'Pillar call failed: contract-mismatch (expected 1.2.3, actual 0.9.0)'
    );
  });

  it('encodes singular vs plural for validation-error issues', () => {
    const single = new PillarCallError({
      kind: 'validation-error',
      issues: [{ field: 'name', reason: 'required' }],
    });
    expect(single.message).toBe('Pillar call failed: validation-error (1 issue)');

    const multi = new PillarCallError({
      kind: 'validation-error',
      issues: [
        { field: 'name', reason: 'required' },
        { field: 'priceCents', reason: 'must be positive' },
      ],
    });
    expect(multi.message).toBe('Pillar call failed: validation-error (2 issues)');
  });

  it('encodes the cause for not-found', () => {
    const err = new PillarCallError({ kind: 'not-found' });
    expect(err.message).toBe('Pillar call failed: not-found');
  });

  it('is throwable and catchable as an Error', () => {
    try {
      throw new PillarCallError({ kind: 'not-found' });
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
      expect(e).toBeInstanceOf(PillarCallError);
      if (e instanceof PillarCallError) {
        expect(e.cause.kind).toBe('not-found');
      }
    }
  });
});

describe('PILLARS', () => {
  it('is the canonical readonly list of pillar ids', () => {
    expect(PILLARS).toEqual([
      'registry',
      'finance',
      'media',
      'inventory',
      'cerebrum',
      'food',
      'lists',
      'contacts',
      'ai',
    ]);
  });

  it('every id is unique', () => {
    expect(new Set(PILLARS).size).toBe(PILLARS.length);
  });

  it('every id matches the kebab-case pillar id pattern', () => {
    const pattern = /^[a-z][a-z0-9-]*$/;
    for (const id of PILLARS) {
      expect(pattern.test(id)).toBe(true);
    }
  });
});
