import { renderHook, act } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useShoppingSort } from '../useShoppingSort.js';

import type { ListItemRow } from '../../../detail/types.js';

function row(overrides: Partial<ListItemRow>): ListItemRow {
  return {
    id: 0,
    listId: 1,
    position: 0,
    label: 'x',
    qty: null,
    unit: null,
    refKind: 'free',
    refId: null,
    checked: 0,
    checkedAt: null,
    dueAt: null,
    notes: null,
    createdAt: '2026-06-01T00:00:00Z',
    ...overrides,
  };
}

describe('PRD-141 — useShoppingSort', () => {
  const items: readonly ListItemRow[] = [
    row({ id: 1, position: 0, checked: 1, checkedAt: '2026-06-02T00:00:00Z' }),
    row({ id: 2, position: 1, checked: 0 }),
    row({ id: 3, position: 2, checked: 1, checkedAt: '2026-06-03T00:00:00Z' }),
  ];

  it('defaults to manual + drag-enabled', () => {
    const { result } = renderHook(() => useShoppingSort(items));
    expect(result.current.mode).toBe('manual');
    expect(result.current.isDragDisabled).toBe(false);
    expect(result.current.sortedItems.map((r) => r.id)).toEqual([1, 2, 3]);
  });

  it('switches to unchecked-first ordering', () => {
    const { result } = renderHook(() => useShoppingSort(items));
    act(() => result.current.setMode('unchecked-first'));
    expect(result.current.sortedItems.map((r) => r.id)).toEqual([2, 1, 3]);
    expect(result.current.isDragDisabled).toBe(true);
  });

  it('switches to recent-check ordering (most recent first)', () => {
    const { result } = renderHook(() => useShoppingSort(items));
    act(() => result.current.setMode('recent-check'));
    expect(result.current.sortedItems.map((r) => r.id)).toEqual([3, 1, 2]);
  });

  it('treats null checkedAt as oldest in recent-check', () => {
    const sample: readonly ListItemRow[] = [
      row({ id: 1, checked: 1, checkedAt: null }),
      row({ id: 2, checked: 1, checkedAt: '2026-06-02T00:00:00Z' }),
    ];
    const { result } = renderHook(() => useShoppingSort(sample));
    act(() => result.current.setMode('recent-check'));
    expect(result.current.sortedItems.map((r) => r.id)).toEqual([2, 1]);
  });
});
