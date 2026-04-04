import { useCallback, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { getResultComponent } from "./result-component-registry";

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
}

const COLOR_CLASSES: Record<string, string> = {
  purple: "text-purple-600 dark:text-purple-400",
  green: "text-green-600 dark:text-green-400",
  blue: "text-blue-600 dark:text-blue-400",
  red: "text-red-600 dark:text-red-400",
  orange: "text-orange-600 dark:text-orange-400",
  yellow: "text-yellow-600 dark:text-yellow-400",
  pink: "text-pink-600 dark:text-pink-400",
  cyan: "text-cyan-600 dark:text-cyan-400",
};

function SectionHeader({
  icon,
  label,
  count,
  color,
}: {
  icon: ReactNode;
  label: string;
  count: number;
  color: string;
}) {
  const colorClass = COLOR_CLASSES[color] ?? "text-foreground";

  return (
    <div
      className={`flex items-center gap-2 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide ${colorClass}`}
      data-testid={`section-header-${label.toLowerCase().replace(/\s+/g, "-")}`}
    >
      {icon}
      <span>{label}</span>
      <span className="ml-auto text-muted-foreground font-normal">{count}</span>
    </div>
  );
}

export function SearchResultsPanel({
  sections,
  query,
  onClose,
  onResultClick,
  onShowMore,
}: SearchResultsPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  const handleOutsideClick = useCallback(
    (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    },
    [onClose]
  );

  // Close on Escape
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleOutsideClick, handleKeyDown]);

  // Sort: context section first, then by highest score descending
  const sortedSections = [...sections]
    .filter((s) => s.hits.length > 0)
    .sort((a, b) => {
      if (a.isContext && !b.isContext) return -1;
      if (!a.isContext && b.isContext) return 1;
      const aMax = Math.max(...a.hits.map((h) => h.score));
      const bMax = Math.max(...b.hits.map((h) => h.score));
      return bMax - aMax;
    });

  // No results state
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

  return (
    <div
      ref={panelRef}
      className="absolute left-0 right-0 top-full z-50 mt-1 max-h-[70vh] overflow-y-auto rounded-lg border bg-popover shadow-lg"
      data-testid="search-results-panel"
    >
      {sortedSections.map((section) => {
        const ResultComponent = getResultComponent(section.domain);

        return (
          <div
            key={section.domain}
            className={section.isContext ? "border-l-2 border-l-primary bg-accent/30" : ""}
            data-testid={`section-${section.domain}`}
          >
            <SectionHeader
              icon={section.icon}
              label={section.label}
              count={section.totalCount}
              color={section.color}
            />
            <ul className="px-1 pb-1">
              {section.hits.map((hit) => (
                <li key={hit.uri}>
                  <button
                    type="button"
                    className="w-full cursor-pointer rounded-md px-2 py-1.5 text-left hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                    onClick={() => onResultClick?.(hit.uri)}
                    data-uri={hit.uri}
                  >
                    <ResultComponent
                      data={{
                        ...hit.data,
                        _query: query,
                        _matchField: hit.matchField,
                        _matchType: hit.matchType,
                      }}
                    />
                  </button>
                </li>
              ))}
            </ul>
            {section.totalCount > section.hits.length && (
              <button
                type="button"
                className="w-full px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground text-left hover:bg-accent/50 transition-colors"
                onClick={() => onShowMore?.(section.domain)}
                data-testid={`show-more-${section.domain}`}
              >
                Show more ({section.totalCount - section.hits.length} remaining)
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
