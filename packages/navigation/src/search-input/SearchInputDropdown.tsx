import { type RefObject } from 'react';

import { useRecentSearches } from '../recent-searches';
import { RecentSearches } from '../RecentSearches';
import { SearchResultsPanel, type SearchResultSection } from '../SearchResultsPanel';
import { useSearchStore } from '../searchStore';

interface SearchInputDropdownProps {
  inputRef: RefObject<HTMLInputElement | null>;
  query: string;
  sections: SearchResultSection[];
  selectedIndex: number;
  onClose: () => void;
  onResultClick: (uri: string) => void;
  onShowMore: (domain: string) => Promise<void> | void;
}

export function SearchInputDropdown({
  inputRef,
  query,
  sections,
  selectedIndex,
  onClose,
  onResultClick,
  onShowMore,
}: SearchInputDropdownProps) {
  const { queries, clearAll } = useRecentSearches();
  const setQuery = useSearchStore((s) => s.setQuery);

  if (query.length > 0) {
    return (
      <SearchResultsPanel
        sections={sections}
        query={query}
        onClose={onClose}
        onResultClick={onResultClick}
        onShowMore={onShowMore}
        selectedIndex={selectedIndex}
      />
    );
  }

  return (
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
  );
}
