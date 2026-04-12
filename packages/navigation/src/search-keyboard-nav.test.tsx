import { act, renderHook } from '@testing-library/react';
import { useRef } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useSearchKeyboardNav } from './search-keyboard-nav';

function createContainer(resultCount: number): HTMLDivElement {
  const container = document.createElement('div');
  for (let i = 0; i < resultCount; i++) {
    const item = document.createElement('div');
    item.setAttribute('data-result-index', String(i));
    item.scrollIntoView = vi.fn();
    container.appendChild(item);
  }
  document.body.appendChild(container);
  return container;
}

function fireKey(container: HTMLElement, key: string) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true });
  vi.spyOn(event, 'preventDefault');
  container.dispatchEvent(event);
  return event;
}

describe('useSearchKeyboardNav', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('starts with selectedIndex -1', () => {
    container = createContainer(3);
    const { result } = renderHook(() => {
      const ref = useRef<HTMLElement>(container);
      return useSearchKeyboardNav({
        resultCount: 3,
        onSelect: vi.fn(),
        onClose: vi.fn(),
        containerRef: ref,
      });
    });
    expect(result.current.selectedIndex).toBe(-1);
  });

  it('ArrowDown moves selection forward', () => {
    container = createContainer(3);
    const { result } = renderHook(() => {
      const ref = useRef<HTMLElement>(container);
      return useSearchKeyboardNav({
        resultCount: 3,
        onSelect: vi.fn(),
        onClose: vi.fn(),
        containerRef: ref,
      });
    });

    act(() => fireKey(container, 'ArrowDown'));
    expect(result.current.selectedIndex).toBe(0);

    act(() => fireKey(container, 'ArrowDown'));
    expect(result.current.selectedIndex).toBe(1);
  });

  it('ArrowDown wraps to 0 from last item', () => {
    container = createContainer(3);
    const { result } = renderHook(() => {
      const ref = useRef<HTMLElement>(container);
      return useSearchKeyboardNav({
        resultCount: 3,
        onSelect: vi.fn(),
        onClose: vi.fn(),
        containerRef: ref,
      });
    });

    // Go to last item
    act(() => fireKey(container, 'ArrowDown')); // 0
    act(() => fireKey(container, 'ArrowDown')); // 1
    act(() => fireKey(container, 'ArrowDown')); // 2
    act(() => fireKey(container, 'ArrowDown')); // wraps to 0
    expect(result.current.selectedIndex).toBe(0);
  });

  it('ArrowUp moves selection backward', () => {
    container = createContainer(3);
    const { result } = renderHook(() => {
      const ref = useRef<HTMLElement>(container);
      return useSearchKeyboardNav({
        resultCount: 3,
        onSelect: vi.fn(),
        onClose: vi.fn(),
        containerRef: ref,
      });
    });

    // Start from -1, ArrowUp goes to last item
    act(() => fireKey(container, 'ArrowUp'));
    expect(result.current.selectedIndex).toBe(2);

    act(() => fireKey(container, 'ArrowUp'));
    expect(result.current.selectedIndex).toBe(1);
  });

  it('Enter calls onSelect with current index', () => {
    container = createContainer(3);
    const onSelect = vi.fn();
    renderHook(() => {
      const ref = useRef<HTMLElement>(container);
      return useSearchKeyboardNav({
        resultCount: 3,
        onSelect,
        onClose: vi.fn(),
        containerRef: ref,
      });
    });

    act(() => fireKey(container, 'ArrowDown')); // select 0
    act(() => fireKey(container, 'Enter'));
    expect(onSelect).toHaveBeenCalledWith(0);
  });

  it('Enter does nothing when nothing selected', () => {
    container = createContainer(3);
    const onSelect = vi.fn();
    renderHook(() => {
      const ref = useRef<HTMLElement>(container);
      return useSearchKeyboardNav({
        resultCount: 3,
        onSelect,
        onClose: vi.fn(),
        containerRef: ref,
      });
    });

    act(() => fireKey(container, 'Enter'));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('Escape calls onClose', () => {
    container = createContainer(3);
    const onClose = vi.fn();
    renderHook(() => {
      const ref = useRef<HTMLElement>(container);
      return useSearchKeyboardNav({
        resultCount: 3,
        onSelect: vi.fn(),
        onClose,
        containerRef: ref,
      });
    });

    act(() => fireKey(container, 'Escape'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('resets selectedIndex when resultCount changes', () => {
    container = createContainer(5);
    let count = 5;
    const { result, rerender } = renderHook(() => {
      const ref = useRef<HTMLElement>(container);
      return useSearchKeyboardNav({
        resultCount: count,
        onSelect: vi.fn(),
        onClose: vi.fn(),
        containerRef: ref,
      });
    });

    act(() => fireKey(container, 'ArrowDown')); // select 0
    expect(result.current.selectedIndex).toBe(0);

    count = 3;
    rerender();
    expect(result.current.selectedIndex).toBe(-1);
  });

  it('scrolls selected item into view', () => {
    container = createContainer(3);
    renderHook(() => {
      const ref = useRef<HTMLElement>(container);
      return useSearchKeyboardNav({
        resultCount: 3,
        onSelect: vi.fn(),
        onClose: vi.fn(),
        containerRef: ref,
      });
    });

    act(() => fireKey(container, 'ArrowDown')); // select 0

    const item = container.querySelector('[data-result-index="0"]');
    expect(item?.scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
  });

  it('Escape works even with 0 results', () => {
    container = createContainer(0);
    const onClose = vi.fn();
    renderHook(() => {
      const ref = useRef<HTMLElement>(container);
      return useSearchKeyboardNav({
        resultCount: 0,
        onSelect: vi.fn(),
        onClose,
        containerRef: ref,
      });
    });

    act(() => fireKey(container, 'Escape'));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
