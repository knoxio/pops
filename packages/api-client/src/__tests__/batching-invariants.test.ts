import { describe, expect, it } from 'vitest';

import {
  CrossPillarBatchError,
  LEGACY_BATCH_TARGET,
  assertSingleTargetBatch,
  batchTargetOfPath,
  checkSingleTargetBatch,
} from '../batching-invariants.js';

import type { BatchableOp } from '../batching-invariants.js';

function ops(...paths: string[]): BatchableOp[] {
  return paths.map((path) => ({ path }));
}

describe('batchTargetOfPath', () => {
  it.each([
    ['finance.wishlist.list', 'finance'],
    ['media.movies.get', 'media'],
    ['core.health', 'core'],
    ['inventory.items.list', 'inventory'],
    ['cerebrum.notes.search', 'cerebrum'],
    ['food.recipes.list', 'food'],
    ['lists.items.list', 'lists'],
  ])('routes %s to %s', (path, expected) => {
    expect(batchTargetOfPath(path)).toBe(expected);
  });

  it('routes unprefixed and unknown-namespace paths to the legacy target', () => {
    expect(batchTargetOfPath('health')).toBe(LEGACY_BATCH_TARGET);
    expect(batchTargetOfPath('pops.health')).toBe(LEGACY_BATCH_TARGET);
    expect(batchTargetOfPath('debug.ping')).toBe(LEGACY_BATCH_TARGET);
    expect(batchTargetOfPath('')).toBe(LEGACY_BATCH_TARGET);
  });
});

describe('assertSingleTargetBatch', () => {
  it('passes for an empty batch', () => {
    expect(() => assertSingleTargetBatch([])).not.toThrow();
  });

  it('passes for a single-op batch regardless of target', () => {
    expect(() => assertSingleTargetBatch(ops('finance.x'))).not.toThrow();
    expect(() => assertSingleTargetBatch(ops('debug.ping'))).not.toThrow();
  });

  it('passes when every op resolves to the same pillar', () => {
    expect(() =>
      assertSingleTargetBatch(ops('finance.wishlist.list', 'finance.budget.summary'))
    ).not.toThrow();
    expect(() =>
      assertSingleTargetBatch(ops('media.movies.get', 'media.shows.list', 'media.images.show'))
    ).not.toThrow();
  });

  it('passes when every op resolves to the legacy catch-all', () => {
    expect(() =>
      assertSingleTargetBatch(ops('health', 'debug.ping', 'pops.bootstrap'))
    ).not.toThrow();
  });

  it('throws CrossPillarBatchError for a cross-pillar batch', () => {
    expect(() => assertSingleTargetBatch(ops('finance.wishlist.list', 'media.movies.get'))).toThrow(
      CrossPillarBatchError
    );
  });

  it('throws for a three-way cross-pillar batch and reports all targets', () => {
    let caught: unknown;
    try {
      assertSingleTargetBatch(ops('finance.a', 'media.b', 'inventory.c'));
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(CrossPillarBatchError);
    const err = caught as CrossPillarBatchError;
    expect(new Set(err.targets)).toEqual(new Set(['finance', 'media', 'inventory']));
    expect(err.offendingPaths).toEqual(
      expect.arrayContaining(['finance.a', 'media.b', 'inventory.c'])
    );
    expect(err.message).toContain('PRD-188');
  });

  it('throws for a batch mixing a pillar with a legacy path', () => {
    let caught: unknown;
    try {
      assertSingleTargetBatch(ops('finance.wishlist.list', 'health'));
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(CrossPillarBatchError);
    const err = caught as CrossPillarBatchError;
    expect(new Set(err.targets)).toEqual(new Set(['finance', LEGACY_BATCH_TARGET]));
    expect(err.offendingPaths).toEqual(expect.arrayContaining(['finance.wishlist.list', 'health']));
  });

  it('throws for a batch mixing a pillar with an unknown-namespace legacy path', () => {
    expect(() => assertSingleTargetBatch(ops('media.movies.get', 'debug.ping'))).toThrow(
      CrossPillarBatchError
    );
  });
});

describe('checkSingleTargetBatch', () => {
  it('returns ok with a null target for an empty batch', () => {
    expect(checkSingleTargetBatch([])).toEqual({ ok: true, target: null });
  });

  it('returns ok with the resolved target for a same-pillar batch', () => {
    expect(checkSingleTargetBatch(ops('finance.a', 'finance.b'))).toEqual({
      ok: true,
      target: 'finance',
    });
  });

  it('returns ok with the legacy target for a legacy-only batch', () => {
    expect(checkSingleTargetBatch(ops('health', 'debug.ping'))).toEqual({
      ok: true,
      target: LEGACY_BATCH_TARGET,
    });
  });

  it('returns a violation for a cross-pillar batch without throwing', () => {
    const result = checkSingleTargetBatch(ops('finance.a', 'media.b'));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(new Set(result.violation.targets)).toEqual(new Set(['finance', 'media']));
    expect(result.violation.message).toContain('PRD-188');
  });

  it('returns a violation when a pillar batch is contaminated with a legacy path', () => {
    const result = checkSingleTargetBatch(ops('media.movies.get', 'pops.bootstrap'));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(new Set(result.violation.targets)).toEqual(new Set(['media', LEGACY_BATCH_TARGET]));
  });
});
