import { useRef } from 'react';

import { SectionView } from './search-results/SectionView';
import { sortSections, usePanelDismiss } from './search-results/usePanelDismiss';

import type { ReactNode } from 'react';

/** A single search hit within a section. */
export interface SearchResultHit {
  uri: string;
  score: number;
  matchField: string;
  matchType: string;
  data: Record<string, unknown>;
}

/** A grouped section of search results for one domain. */
export interface SearchResultSection {
  domain: string;
  label: string;
  icon: ReactNode;
  color: string;
  hits: SearchResultHit[];
  totalCount: number;
  isContext: boolean;
}

export interface SearchResultsPanelProps {
  sections: SearchResultSection[];
  query: string;
  onClose: () => void;
  onResultClick?: (uri: string) => void;
  onShowMore?: (domain: string) => void;
  /** Index of the currently keyboard-selected result (flat, across all sections). -1 = none. */
  selectedIndex?: number;
}

export function SearchResultsPanel({
  sections,
  query,
  onClose,
  onResultClick,
  onShowMore,
  selectedIndex = -1,
}: SearchResultsPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  usePanelDismiss(panelRef, onClose);

  const sortedSections = sortSections(sections);

  if (sortedSections.length === 0) {
    return (
      <div
        ref={panelRef}
        className="absolute left-0 right-0 top-full z-50 mt-1 rounded-lg border bg-popover p-4 text-center text-sm text-muted-foreground shadow-lg"
        data-testid="search-results-panel"
      >
        No results found
      </div>
    );
  }

  let cursor = 0;
  return (
    <div
      ref={panelRef}
      className="absolute left-0 right-0 top-full z-50 mt-1 max-h-[70vh] overflow-y-auto rounded-lg border bg-popover shadow-lg"
      data-testid="search-results-panel"
    >
      {sortedSections.map((section) => {
        const startIndex = cursor;
        cursor += section.hits.length;
        return (
          <SectionView
            key={section.domain}
            section={section}
            query={query}
            startIndex={startIndex}
            selectedIndex={selectedIndex}
            onResultClick={onResultClick}
            onShowMore={onShowMore}
          />
        );
      })}
    </div>
  );
}
