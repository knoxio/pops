import { renderHook, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useDebounce } from '../useDebounce.js';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('recipe-crud-pages — useDebounce', () => {
  it('returns the initial value synchronously', () => {
    const { result } = renderHook(({ v }: { v: string }) => useDebounce(v, 200), {
      initialProps: { v: 'hello' },
    });
    expect(result.current).toBe('hello');
  });

  it('delays propagating a new value until the timeout fires', () => {
    const { result, rerender } = renderHook(({ v }: { v: string }) => useDebounce(v, 200), {
      initialProps: { v: 'a' },
    });
    rerender({ v: 'ab' });
    expect(result.current).toBe('a');
    act(() => {
      vi.advanceTimersByTime(199);
    });
    expect(result.current).toBe('a');
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe('ab');
  });

  it('cancels the pending timer when the value changes again', () => {
    const { result, rerender } = renderHook(({ v }: { v: string }) => useDebounce(v, 200), {
      initialProps: { v: 'a' },
    });
    rerender({ v: 'ab' });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    rerender({ v: 'abc' });
    act(() => {
      vi.advanceTimersByTime(199);
    });
    expect(result.current).toBe('a');
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe('abc');
  });
});
