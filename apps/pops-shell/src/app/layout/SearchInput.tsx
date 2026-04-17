import { trpc } from '@/lib/trpc';
import { useSearchStore } from '@/store/searchStore';
import { ArrowRightLeft, Box, Building2, Film, PiggyBank, Search, Tv, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  type SearchResultHit,
  type SearchResultSection,
  RecentSearches,
  SearchResultsPanel,
  useCurrentApp,
  useFocusTrap,
  useRecentSearches,
  useSearchKeyboardNav,
  useSearchResultNavigation,
} from '@pops/navigation';
import { Button, Input } from '@pops/ui';

import type { ReactNode } from 'react';

const DEBOUNCE_MS = 300;

/** Map Lucide icon name string → icon ReactNode (14px). */
const ICON_MAP: Record<string, ReactNode> = {
  Film: <Film className="h-3.5 w-3.5" />,
  Tv: <Tv className="h-3.5 w-3.5" />,
  Box: <Box className="h-3.5 w-3.5" />,
  ArrowRightLeft: <ArrowRightLeft className="h-3.5 w-3.5" />,
  PiggyBank: <PiggyBank className="h-3.5 w-3.5" />,
  Building2: <Building2 className="h-3.5 w-3.5" />,
};

/** Derive a human-readable section label from a domain slug. */
function domainToLabel(domain: string): string {
  return domain
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function SearchInput() {
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const query = useSearchStore((s) => s.query);
  const isOpen = useSearchStore((s) => s.isOpen);
  const setQuery = useSearchStore((s) => s.setQuery);
  const setOpen = useSearchStore((s) => s.setOpen);
  const clear = useSearchStore((s) => s.clear);

  const [isFocused, setIsFocused] = useState(false);

  const currentApp = useCurrentApp();
  const { navigateTo } = useSearchResultNavigation();
  const { queries, addQuery, clearAll } = useRecentSearches();
  const utils = trpc.useUtils();

  /** Extra hits appended by "Show more" per domain. */
  const [extraHits, setExtraHits] = useState<Record<string, SearchResultHit[]>>({});

  const { data: searchData } = trpc.core.search.query.useQuery(
    { text: query, context: { app: currentApp ?? null, page: null } },
    { enabled: isOpen && query.length > 0 }
  );

  // Reset extra hits when the query changes
  useEffect(() => {
    setExtraHits({});
  }, [query]);

  const sections = useMemo<SearchResultSection[]>(() => {
    if (!searchData?.sections) return [];
    return searchData.sections.map((section) => {
      const baseHits: SearchResultHit[] = section.hits.map((h) => ({
        ...h,
        data: (h.data ?? {}) as Record<string, unknown>,
      }));
      const extra = extraHits[section.domain] ?? [];
      return {
        domain: section.domain,
        label: domainToLabel(section.domain),
        icon: ICON_MAP[section.icon] ?? <Search className="h-3.5 w-3.5" />,
        color: section.color,
        isContext: section.isContextSection,
        hits: [...baseHits, ...extra],
        totalCount: section.totalCount,
      };
    });
  }, [searchData, extraHits]);

  // Flat ordered URI list matching the sort order SearchResultsPanel uses
  // (context section first, then by highest score descending)
  const orderedUris = useMemo(() => {
    const sorted = [...sections]
      .filter((s) => s.hits.length > 0)
      .toSorted((a, b) => {
        if (a.isContext && !b.isContext) return -1;
        if (!a.isContext && b.isContext) return 1;
        const aMax = Math.max(...a.hits.map((h) => h.score));
        const bMax = Math.max(...b.hits.map((h) => h.score));
        return bMax - aMax;
      });
    return sorted.flatMap((s) => s.hits.map((h) => h.uri));
  }, [sections]);

  const handleShowMore = useCallback(
    async (domain: string) => {
      const section = sections.find((s) => s.domain === domain);
      const offset = section?.hits.length ?? 0;
      const result = await utils.core.search.showMore.fetch({
        domain,
        text: query,
        context: { app: currentApp ?? null, page: null },
        offset,
      });
      const newHits: SearchResultHit[] = result.hits.map((h) => ({
        ...h,
        data: (h.data ?? {}) as Record<string, unknown>,
      }));
      setExtraHits((prev) => ({
        ...prev,
        [domain]: [...(prev[domain] ?? []), ...newHits],
      }));
    },
    [sections, query, currentApp, utils]
  );

  const handleResultClick = useCallback(
    (uri: string) => {
      if (query) addQuery(query);
      navigateTo(uri);
      clear();
    },
    [query, addQuery, navigateTo, clear]
  );

  const handleClose = useCallback(() => {
    setOpen(false);
  }, [setOpen]);

  const { selectedIndex } = useSearchKeyboardNav({
    containerRef,
    resultCount: orderedUris.length,
    onSelect: (index) => {
      handleResultClick(orderedUris[index] ?? '');
    },
    onClose: handleClose,
  });

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setQuery(value);
      }, DEBOUNCE_MS);
    },
    [setQuery]
  );

  const handleClear = useCallback(() => {
    clear();
    if (inputRef.current) {
      inputRef.current.value = '';
      inputRef.current.focus();
    }
  }, [clear]);

  // Cmd+K / Ctrl+K keyboard shortcut
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
  }, []);

  // Clean up debounce timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const showPanel = isOpen && (query.length > 0 || (isFocused && queries.length > 0));

  // Trap Tab focus within the container when the results panel is open.
  // Escape is already handled by useSearchKeyboardNav (calls handleClose).
  useFocusTrap({ containerRef, active: showPanel });

  return (
    <div ref={containerRef} className="hidden md:flex relative items-center max-w-sm w-full mx-4">
      <Search className="absolute left-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
      <Input
        ref={inputRef}
        type="text"
        placeholder="Search POPS..."
        defaultValue={query}
        onChange={handleChange}
        onFocus={() => {
          setIsFocused(true);
          setOpen(true);
        }}
        onBlur={(e) => {
          if (!containerRef.current?.contains(e.relatedTarget as Node)) {
            setIsFocused(false);
          }
        }}
        className="pl-9 pr-9 h-9 bg-muted/50 border-transparent focus:border-border focus:bg-background transition-colors"
        aria-label="Search POPS"
      />
      {query ? (
        <Button
          variant="ghost"
          size="icon"
          onClick={handleClear}
          className="absolute right-1 h-7 w-7 text-muted-foreground hover:text-foreground"
          aria-label="Clear search"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      ) : (
        <kbd className="absolute right-2.5 hidden lg:inline-flex h-5 items-center gap-0.5 rounded border bg-muted px-1.5 text-[10px] font-medium text-muted-foreground pointer-events-none">
          ⌘K
        </kbd>
      )}
      {showPanel &&
        (query.length > 0 ? (
          <SearchResultsPanel
            sections={sections}
            query={query}
            onClose={handleClose}
            onResultClick={handleResultClick}
            onShowMore={handleShowMore}
            selectedIndex={selectedIndex}
          />
        ) : (
          <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-lg border bg-popover shadow-lg">
            <RecentSearches
              queries={queries}
              onSelect={(q) => {
                if (inputRef.current) inputRef.current.value = q;
                setQuery(q);
              }}
              onClear={clearAll}
            />
          </div>
        ))}
    </div>
  );
}
