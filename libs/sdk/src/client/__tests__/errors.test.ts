import { describe, expect, it } from 'vitest';

import {
  isBadRequest,
  isConflict,
  isNotFound,
  isOk,
  isUnauthorized,
  PillarCallError,
  PillarSdkError,
  type CallResult,
} from '../errors.js';

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
    const notFound: CallResult<number> = { kind: 'not-found', pillar: 'finance' };
    const conflict: CallResult<number> = { kind: 'conflict', pillar: 'finance' };
    const badRequest: CallResult<number> = { kind: 'bad-request', pillar: 'finance' };
    const unauthorized: CallResult<number> = { kind: 'unauthorized', pillar: 'finance' };
    expect(isOk(unavailable)).toBe(false);
    expect(isOk(degraded)).toBe(false);
    expect(isOk(mismatch)).toBe(false);
    expect(isOk(notFound)).toBe(false);
    expect(isOk(conflict)).toBe(false);
    expect(isOk(badRequest)).toBe(false);
    expect(isOk(unauthorized)).toBe(false);
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

  it("carries the 'not-found' failure with an optional message", () => {
    const err = new PillarCallError('cerebrum', {
      kind: 'not-found',
      pillar: 'cerebrum',
      message: 'engram eng_x not found',
    });
    expect(err.result.kind).toBe('not-found');
    if (err.result.kind === 'not-found') {
      expect(err.result.message).toBe('engram eng_x not found');
    }
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

describe('isNotFound', () => {
  it('matches a PillarCallError with kind not-found', () => {
    const err = new PillarCallError('cerebrum', { kind: 'not-found', pillar: 'cerebrum' });
    expect(isNotFound(err)).toBe(true);
  });

  it('does not match contract-mismatch (the old conflated check)', () => {
    const err = new PillarCallError('cerebrum', {
      kind: 'contract-mismatch',
      pillar: 'cerebrum',
    });
    expect(isNotFound(err)).toBe(false);
  });

  it('does not match conflict / bad-request / unavailable / degraded', () => {
    const conflict = new PillarCallError('finance', { kind: 'conflict', pillar: 'finance' });
    const badRequest = new PillarCallError('finance', { kind: 'bad-request', pillar: 'finance' });
    const unavailable = new PillarCallError('finance', { kind: 'unavailable', pillar: 'finance' });
    const degraded = new PillarCallError('finance', {
      kind: 'degraded',
      pillar: 'finance',
      reason: 'reconciling',
    });
    expect(isNotFound(conflict)).toBe(false);
    expect(isNotFound(badRequest)).toBe(false);
    expect(isNotFound(unavailable)).toBe(false);
    expect(isNotFound(degraded)).toBe(false);
  });

  it('does not match non-PillarCallError values', () => {
    expect(isNotFound(null)).toBe(false);
    expect(isNotFound(undefined)).toBe(false);
    expect(isNotFound(new Error('plain'))).toBe(false);
    expect(isNotFound({ result: { kind: 'not-found' } })).toBe(false);
  });

  it('narrows the type so .result.message is reachable', () => {
    const err: unknown = new PillarCallError('cerebrum', {
      kind: 'not-found',
      pillar: 'cerebrum',
      message: 'missing',
    });
    if (isNotFound(err)) {
      const msg: string | undefined = err.result.message;
      expect(msg).toBe('missing');
    }
  });
});

describe('isConflict', () => {
  it('matches a PillarCallError with kind conflict', () => {
    const err = new PillarCallError('food', { kind: 'conflict', pillar: 'food' });
    expect(isConflict(err)).toBe(true);
  });

  it('does not match other kinds', () => {
    const notFound = new PillarCallError('food', { kind: 'not-found', pillar: 'food' });
    expect(isConflict(notFound)).toBe(false);
    expect(isConflict(null)).toBe(false);
  });
});

describe('isBadRequest', () => {
  it('matches a PillarCallError with kind bad-request', () => {
    const err = new PillarCallError('food', { kind: 'bad-request', pillar: 'food' });
    expect(isBadRequest(err)).toBe(true);
  });

  it('does not match other kinds', () => {
    const notFound = new PillarCallError('food', { kind: 'not-found', pillar: 'food' });
    expect(isBadRequest(notFound)).toBe(false);
    expect(isBadRequest(new Error())).toBe(false);
  });

  it('does not match unauthorized', () => {
    const unauthorized = new PillarCallError('food', { kind: 'unauthorized', pillar: 'food' });
    expect(isBadRequest(unauthorized)).toBe(false);
  });
});

describe('isUnauthorized', () => {
  it('matches a PillarCallError with kind unauthorized', () => {
    const err = new PillarCallError('food', { kind: 'unauthorized', pillar: 'food' });
    expect(isUnauthorized(err)).toBe(true);
  });

  it('does not match other kinds', () => {
    const badRequest = new PillarCallError('food', { kind: 'bad-request', pillar: 'food' });
    const notFound = new PillarCallError('food', { kind: 'not-found', pillar: 'food' });
    expect(isUnauthorized(badRequest)).toBe(false);
    expect(isUnauthorized(notFound)).toBe(false);
    expect(isUnauthorized(null)).toBe(false);
    expect(isUnauthorized(new Error())).toBe(false);
  });

  it('narrows the type so .result.message is reachable', () => {
    const err: unknown = new PillarCallError('food', {
      kind: 'unauthorized',
      pillar: 'food',
      message: 'token expired',
    });
    if (isUnauthorized(err)) {
      const msg: string | undefined = err.result.message;
      expect(msg).toBe('token expired');
    }
  });
});
