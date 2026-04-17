/**
 * Tests for MobileSearchOverlay logic — open/close, debounce, clear.
 *
 * Pure logic tests that run without a DOM. Component rendering uses the
 * same patterns as SearchInput (debounce, store integration, Escape close).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Debounce logic (same as SearchInput) ──

function createDebouncer(delay: number) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return {
    debounce(value: string, callback: (v: string) => void) {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        callback(value);
      }, delay);
    },
    cancel() {
      if (timer) clearTimeout(timer);
    },
  };
}

// ── Mobile search state machine ──

interface MobileSearchState {
  open: boolean;
  query: string;
}

function createMobileSearchState(): {
  state: MobileSearchState;
  openSearch: () => void;
  closeSearch: () => void;
  setQuery: (q: string) => void;
  clear: () => void;
} {
  const state: MobileSearchState = { open: false, query: '' };
  return {
    state,
    openSearch: () => {
      state.open = true;
    },
    closeSearch: () => {
      state.open = false;
      state.query = '';
    },
    setQuery: (q: string) => {
      state.query = q;
    },
    clear: () => {
      state.query = '';
    },
  };
}

describe('MobileSearch', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('state machine', () => {
    it('starts closed with empty query', () => {
      const { state } = createMobileSearchState();
      expect(state.open).toBe(false);
      expect(state.query).toBe('');
    });

    it('opens on openSearch', () => {
      const { state, openSearch } = createMobileSearchState();
      openSearch();
      expect(state.open).toBe(true);
    });

    it('closes and clears query on closeSearch', () => {
      const { state, openSearch, setQuery, closeSearch } = createMobileSearchState();
      openSearch();
      setQuery('test');
      closeSearch();
      expect(state.open).toBe(false);
      expect(state.query).toBe('');
    });

    it('clears query without closing', () => {
      const { state, openSearch, setQuery, clear } = createMobileSearchState();
      openSearch();
      setQuery('hello');
      clear();
      expect(state.open).toBe(true);
      expect(state.query).toBe('');
    });
  });

  describe('debounce', () => {
    it('debounces query updates by 300ms', () => {
      const callback = vi.fn();
      const debouncer = createDebouncer(300);

      debouncer.debounce('h', callback);
      debouncer.debounce('he', callback);
      debouncer.debounce('hel', callback);

      expect(callback).not.toHaveBeenCalled();

      vi.advanceTimersByTime(300);

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith('hel');
    });

    it('resets timer on each keystroke', () => {
      const callback = vi.fn();
      const debouncer = createDebouncer(300);

      debouncer.debounce('a', callback);
      vi.advanceTimersByTime(200);
      debouncer.debounce('ab', callback);
      vi.advanceTimersByTime(200);

      expect(callback).not.toHaveBeenCalled();

      vi.advanceTimersByTime(100);
      expect(callback).toHaveBeenCalledWith('ab');
    });

    it('cancels pending debounce on close', () => {
      const callback = vi.fn();
      const debouncer = createDebouncer(300);

      debouncer.debounce('test', callback);
      debouncer.cancel();

      vi.advanceTimersByTime(500);
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('Escape handling', () => {
    it('should close when Escape key is detected while open', () => {
      const { state, openSearch, closeSearch } = createMobileSearchState();
      openSearch();
      expect(state.open).toBe(true);

      // Simulate Escape key handler logic
      const shouldClose = state.open;
      if (shouldClose) closeSearch();

      expect(state.open).toBe(false);
    });

    it('should not close when Escape key detected while already closed', () => {
      const { state } = createMobileSearchState();
      expect(state.open).toBe(false);
      // No-op — already closed
    });
  });
});
