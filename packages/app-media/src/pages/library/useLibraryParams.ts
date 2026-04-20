import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';

import { useDebouncedValue } from '@pops/ui';

import { isValidMediaType, isValidSort, PAGE_SIZE_OPTIONS } from './types';

function parseSearchParams(searchParams: URLSearchParams) {
  const rawType = searchParams.get('type');
  const rawSort = searchParams.get('sort');
  return {
    typeFilter: isValidMediaType(rawType) ? rawType : 'all',
    sortBy: isValidSort(rawSort) ? rawSort : 'title',
    genreFilter: searchParams.get('genre') ?? null,
    searchQuery: searchParams.get('q') ?? '',
    page: Math.max(1, Number(searchParams.get('page')) || 1),
    pageSize: PAGE_SIZE_OPTIONS.find((s) => s === Number(searchParams.get('pageSize'))) ?? 24,
  };
}

function useDebouncedSearchSync(
  debouncedSearch: string,
  setSearchParams: ReturnType<typeof useSearchParams>[1]
) {
  const hasMountedRef = useRef(false);
  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (debouncedSearch) next.set('q', debouncedSearch);
        else next.delete('q');
        next.set('page', '1');
        return next;
      },
      { replace: true }
    );
  }, [debouncedSearch]);
}

function buildSetters(setSearchParams: ReturnType<typeof useSearchParams>[1]) {
  const setParam = (key: string, value: string) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, value);
        else next.delete(key);
        if (key !== 'page' && key !== 'pageSize') {
          next.set('page', '1');
        }
        return next;
      },
      { replace: true }
    );
  };
  const setPageSize = (s: number) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('pageSize', String(s));
        next.set('page', '1');
        return next;
      },
      { replace: true }
    );
  };
  return { setParam, setPageSize };
}

export function useLibraryParams() {
  const [searchParams, setSearchParams] = useSearchParams();
  const parsed = parseSearchParams(searchParams);

  const [localSearch, setLocalSearch] = useState(parsed.searchQuery);
  const debouncedSearch = useDebouncedValue(localSearch, 300);

  useDebouncedSearchSync(debouncedSearch, setSearchParams);
  const { setParam, setPageSize } = buildSetters(setSearchParams);

  return {
    ...parsed,
    localSearch,
    setLocalSearch,
    debouncedSearch,
    setParam,
    setPageSize,
  };
}
