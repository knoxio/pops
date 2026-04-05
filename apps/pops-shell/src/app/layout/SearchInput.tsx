import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Search, X, Film, Tv, Box, ArrowRightLeft, PiggyBank, Building2 } from "lucide-react";
import { Input, Button } from "@pops/ui";
import { useSearchStore } from "@/store/searchStore";
import { trpc } from "@/lib/trpc";
import {
  SearchResultsPanel,
  type SearchResultSection,
  type SearchResultHit,
  useCurrentApp,
  useSearchResultNavigation,
} from "@pops/navigation";

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
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function SearchInput() {
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const query = useSearchStore((s) => s.query);
  const isOpen = useSearchStore((s) => s.isOpen);
  const setQuery = useSearchStore((s) => s.setQuery);
  const setOpen = useSearchStore((s) => s.setOpen);
  const clear = useSearchStore((s) => s.clear);

  const currentApp = useCurrentApp();
  const { navigateTo } = useSearchResultNavigation();
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
      navigateTo(uri);
      clear();
    },
    [navigateTo, clear]
  );

  const handleClose = useCallback(() => {
    setOpen(false);
  }, [setOpen]);

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
      inputRef.current.value = "";
      inputRef.current.focus();
    }
  }, [clear]);

  // Cmd+K / Ctrl+K keyboard shortcut
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Clean up debounce timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const showPanel = isOpen && query.length > 0;

  return (
    <div className="hidden md:flex relative items-center max-w-sm w-full mx-4">
      <Search className="absolute left-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
      <Input
        ref={inputRef}
        type="text"
        placeholder="Search POPS..."
        defaultValue={query}
        onChange={handleChange}
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
      {showPanel && (
        <SearchResultsPanel
          sections={sections}
          query={query}
          onClose={handleClose}
          onResultClick={handleResultClick}
          onShowMore={handleShowMore}
        />
      )}
    </div>
  );
}
