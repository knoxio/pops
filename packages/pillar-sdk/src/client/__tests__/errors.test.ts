import { describe, expect, it } from 'vitest';

import { isOk, PillarCallError, PillarSdkError, type CallResult } from '../errors.js';

describe('CallResult', () => {
  it('isOk narrows the success branch', () => {
    const ok: CallResult<number> = { kind: 'ok', value: 42 };
    if (isOk(ok)) {
      const n: number = ok.value;
      expect(n).toBe(42);
    }
  });

  it('isOk returns false for failure branches', () => {
    const unavailable: CallResult<number> = { kind: 'unavailable', pillar: 'finance' };
    const degraded: CallResult<number> = {
      kind: 'degraded',
      pillar: 'finance',
      reason: 'reconciling',
    };
    const mismatch: CallResult<number> = {
      kind: 'contract-mismatch',
      pillar: 'finance',
    };
    expect(isOk(unavailable)).toBe(false);
    expect(isOk(degraded)).toBe(false);
    expect(isOk(mismatch)).toBe(false);
  });
});

describe('PillarCallError', () => {
  it('carries the pillar id and the failure result', () => {
    const err = new PillarCallError('finance', { kind: 'unavailable', pillar: 'finance' });
    expect(err.name).toBe('PillarCallError');
    expect(err.pillarId).toBe('finance');
    expect(err.result.kind).toBe('unavailable');
    expect(err.message).toContain('finance');
    expect(err.message).toContain('unavailable');
  });
});

describe('PillarSdkError', () => {
  it('wraps a cause for transport-level failures', () => {
    const root = new Error('connection refused');
    const err = new PillarSdkError('registry fetch failed', { cause: root });
    expect(err.name).toBe('PillarSdkError');
    expect(err.cause).toBe(root);
  });
});
