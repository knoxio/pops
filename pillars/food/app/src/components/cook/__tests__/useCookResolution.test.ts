import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useCookResolution } from '../useCookResolution.js';

import type { LineConsumeNeed, LineShortfall } from '../cook-resolution-types.js';

function makeNeed(over: Partial<LineConsumeNeed> = {}): LineConsumeNeed {
  return {
    lineIndex: 1,
    ingredientId: 100,
    ingredientName: 'Onion',
    variantId: 200,
    variantName: 'Diced',
    prepStateId: null,
    prepStateLabel: null,
    qty: 100,
    canonicalUnit: 'g',
    optional: false,
    ...over,
  };
}

function makeShortfall(over: Partial<LineShortfall> = {}): LineShortfall {
  return {
    lineIndex: 1,
    ingredientId: 100,
    ingredientName: 'Onion',
    variantName: 'Diced',
    prepStateLabel: null,
    needed: 100,
    available: 0,
    unit: 'g',
    ...over,
  };
}

describe('useCookResolution', () => {
  it('seeds kind=fifo for every non-optional covered line', () => {
    const needs: LineConsumeNeed[] = [
      makeNeed({ lineIndex: 1 }),
      makeNeed({ lineIndex: 2 }),
      makeNeed({ lineIndex: 3, optional: true }),
    ];
    const { result } = renderHook(() =>
      useCookResolution({ lineNeeds: needs, shortfalls: [], scaleFactor: 1 })
    );

    expect(result.current.resolutionMap.get(1)).toEqual({ kind: 'fifo' });
    expect(result.current.resolutionMap.get(2)).toEqual({ kind: 'fifo' });
    expect(result.current.resolutionMap.has(3)).toBe(false);
    expect(result.current.unresolvedShortfallCount).toBe(0);
  });

  it('counts shortfalls as unresolved until the user picks a non-fifo resolution', () => {
    const needs: LineConsumeNeed[] = [makeNeed({ lineIndex: 1 }), makeNeed({ lineIndex: 2 })];
    const shortfalls: LineShortfall[] = [
      makeShortfall({ lineIndex: 2, needed: 100, available: 30 }),
    ];

    const { result } = renderHook(() =>
      useCookResolution({ lineNeeds: needs, shortfalls, scaleFactor: 1 })
    );

    expect(result.current.unresolvedShortfallCount).toBe(1);

    act(() => result.current.setResolution(2, { kind: 'external' }));
    expect(result.current.unresolvedShortfallCount).toBe(0);

    act(() => result.current.setResolution(2, { kind: 'fifo' }));
    expect(result.current.unresolvedShortfallCount).toBe(1);

    act(() =>
      result.current.setResolution(2, {
        kind: 'partial',
        batchId: 7,
        consumeQty: 30,
        externalQty: 70,
      })
    );
    expect(result.current.unresolvedShortfallCount).toBe(0);
  });

  it('keeps a batch-override unresolved when consumeQty < needed (qty-aware gate)', () => {
    const needs: LineConsumeNeed[] = [makeNeed({ lineIndex: 1 })];
    const shortfalls: LineShortfall[] = [
      makeShortfall({ lineIndex: 1, needed: 100, available: 0 }),
    ];

    const { result } = renderHook(() =>
      useCookResolution({ lineNeeds: needs, shortfalls, scaleFactor: 1 })
    );

    act(() =>
      result.current.setResolution(1, { kind: 'batch-override', batchId: 9, consumeQty: 50 })
    );
    expect(result.current.unresolvedShortfallCount).toBe(1);

    act(() =>
      result.current.setResolution(1, { kind: 'batch-override', batchId: 9, consumeQty: 100 })
    );
    expect(result.current.unresolvedShortfallCount).toBe(0);
  });

  it('keeps a partial resolution unresolved when consumeQty + externalQty < needed', () => {
    const needs: LineConsumeNeed[] = [makeNeed({ lineIndex: 1 })];
    const shortfalls: LineShortfall[] = [
      makeShortfall({ lineIndex: 1, needed: 100, available: 30 }),
    ];

    const { result } = renderHook(() =>
      useCookResolution({ lineNeeds: needs, shortfalls, scaleFactor: 1 })
    );

    act(() =>
      result.current.setResolution(1, {
        kind: 'partial',
        batchId: 5,
        consumeQty: 30,
        externalQty: 40,
      })
    );
    expect(result.current.unresolvedShortfallCount).toBe(1);

    act(() =>
      result.current.setResolution(1, {
        kind: 'partial',
        batchId: 5,
        consumeQty: 30,
        externalQty: 70,
      })
    );
    expect(result.current.unresolvedShortfallCount).toBe(0);
  });

  it('skips optional shortfalls per the fifo-consumption-ui silent-skip contract', () => {
    const needs: LineConsumeNeed[] = [makeNeed({ lineIndex: 1, optional: true })];
    const shortfalls: LineShortfall[] = [makeShortfall({ lineIndex: 1 })];

    const { result } = renderHook(() =>
      useCookResolution({ lineNeeds: needs, shortfalls, scaleFactor: 1 })
    );

    expect(result.current.unresolvedShortfallCount).toBe(0);
    expect(result.current.resolutionMap.has(1)).toBe(false);
  });

  it('resets the resolution map and bumps scaleResetSignal when scaleFactor changes', () => {
    const needs: LineConsumeNeed[] = [makeNeed({ lineIndex: 1 })];
    const shortfalls: LineShortfall[] = [makeShortfall({ lineIndex: 1 })];

    const { result, rerender } = renderHook(
      ({ scale }: { scale: number }) =>
        useCookResolution({ lineNeeds: needs, shortfalls, scaleFactor: scale }),
      { initialProps: { scale: 1 } }
    );

    act(() => result.current.setResolution(1, { kind: 'external' }));
    expect(result.current.unresolvedShortfallCount).toBe(0);
    expect(result.current.scaleResetSignal).toBe(0);

    rerender({ scale: 2 });
    expect(result.current.scaleResetSignal).toBe(1);
    expect(result.current.resolutionMap.get(1)).toBeUndefined();
    expect(result.current.unresolvedShortfallCount).toBe(1);
  });
});
