import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { useRecentSearches } from './recent-searches';

beforeEach(() => {
  localStorage.clear();
});

describe('useRecentSearches', () => {
  it('returns empty array initially', () => {
    const { result } = renderHook(() => useRecentSearches());
    expect(result.current.queries).toEqual([]);
  });

  it('adds a query', () => {
    const { result } = renderHook(() => useRecentSearches());
    act(() => result.current.addQuery('breaking bad'));
    expect(result.current.queries).toEqual(['breaking bad']);
  });

  it('persists to localStorage', () => {
    const { result } = renderHook(() => useRecentSearches());
    act(() => result.current.addQuery('matrix'));
    expect(JSON.parse(localStorage.getItem('pops:recent-searches')!)).toEqual(['matrix']);
  });

  it('puts most recent first', () => {
    const { result } = renderHook(() => useRecentSearches());
    act(() => result.current.addQuery('first'));
    act(() => result.current.addQuery('second'));
    expect(result.current.queries).toEqual(['second', 'first']);
  });

  it('dedupes queries (moves to front)', () => {
    const { result } = renderHook(() => useRecentSearches());
    act(() => result.current.addQuery('alpha'));
    act(() => result.current.addQuery('beta'));
    act(() => result.current.addQuery('alpha'));
    expect(result.current.queries).toEqual(['alpha', 'beta']);
  });

  it('limits to 10 queries', () => {
    const { result } = renderHook(() => useRecentSearches());
    for (let i = 0; i < 12; i++) {
      act(() => result.current.addQuery(`query-${i}`));
    }
    expect(result.current.queries).toHaveLength(10);
    expect(result.current.queries[0]).toBe('query-11');
    expect(result.current.queries[9]).toBe('query-2');
  });

  it('ignores empty/whitespace queries', () => {
    const { result } = renderHook(() => useRecentSearches());
    act(() => result.current.addQuery(''));
    act(() => result.current.addQuery('   '));
    expect(result.current.queries).toEqual([]);
  });

  it('trims whitespace from queries', () => {
    const { result } = renderHook(() => useRecentSearches());
    act(() => result.current.addQuery('  hello  '));
    expect(result.current.queries).toEqual(['hello']);
  });

  it('clears all queries', () => {
    const { result } = renderHook(() => useRecentSearches());
    act(() => result.current.addQuery('one'));
    act(() => result.current.addQuery('two'));
    act(() => result.current.clearAll());
    expect(result.current.queries).toEqual([]);
    expect(localStorage.getItem('pops:recent-searches')).toBeNull();
  });

  it('reads existing localStorage data on mount', () => {
    localStorage.setItem('pops:recent-searches', JSON.stringify(['saved']));
    const { result } = renderHook(() => useRecentSearches());
    expect(result.current.queries).toEqual(['saved']);
  });

  it('handles corrupted localStorage gracefully', () => {
    localStorage.setItem('pops:recent-searches', 'not-json');
    const { result } = renderHook(() => useRecentSearches());
    expect(result.current.queries).toEqual([]);
  });
});
