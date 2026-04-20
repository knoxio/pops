import { type RefObject, useCallback, useEffect, useRef } from 'react';

import { useSearchResultNavigation } from '../hooks';
import { useRecentSearches } from '../recent-searches';
import { useSearchStore } from '../searchStore';

const DEBOUNCE_MS = 300;

interface UseSearchInputHandlersArgs {
  inputRef: RefObject<HTMLInputElement | null>;
}

export interface SearchInputHandlers {
  handleResultClick: (uri: string) => void;
  handleClose: () => void;
  handleChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleClear: () => void;
}

export function useSearchInputHandlers({
  inputRef,
}: UseSearchInputHandlersArgs): SearchInputHandlers {
  const query = useSearchStore((s) => s.query);
  const setQuery = useSearchStore((s) => s.setQuery);
  const setOpen = useSearchStore((s) => s.setOpen);
  const clear = useSearchStore((s) => s.clear);
  const { addQuery } = useRecentSearches();
  const { navigateTo } = useSearchResultNavigation();

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelDebounce = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
  }, []);

  useEffect(() => () => cancelDebounce(), [cancelDebounce]);

  const handleResultClick = useCallback(
    (uri: string) => {
      cancelDebounce();
      if (query) addQuery(query);
      if (inputRef.current) inputRef.current.value = '';
      navigateTo(uri);
      clear();
    },
    [cancelDebounce, query, addQuery, inputRef, navigateTo, clear]
  );

  const handleClose = useCallback(() => {
    cancelDebounce();
    setOpen(false);
  }, [cancelDebounce, setOpen]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      cancelDebounce();
      if (!value) {
        // Immediate clear; re-open so RecentSearches shows while input is focused
        setQuery('');
        setOpen(true);
      } else {
        debounceTimerRef.current = setTimeout(() => setQuery(value), DEBOUNCE_MS);
      }
    },
    [cancelDebounce, setQuery, setOpen]
  );

  const handleClear = useCallback(() => {
    cancelDebounce();
    clear();
    if (inputRef.current) {
      inputRef.current.value = '';
      inputRef.current.focus();
    }
    setOpen(true);
  }, [cancelDebounce, clear, setOpen, inputRef]);

  return { handleResultClick, handleClose, handleChange, handleClear };
}

export function useCmdKShortcut(inputRef: RefObject<HTMLInputElement | null>): void {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [inputRef]);
}
