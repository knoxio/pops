/**
 * RecentSearches — renders a list of recent search queries.
 *
 * Shown when the search input is focused and empty.
 * Click a query to populate the input and trigger search.
 * "Clear recent" button removes all history.
 */

interface RecentSearchesProps {
  queries: string[];
  onSelect: (query: string) => void;
  onClear: () => void;
}

export function RecentSearches({ queries, onSelect, onClear }: RecentSearchesProps) {
  if (queries.length === 0) return null;

  return (
    <div className="flex flex-col" data-testid="recent-searches">
      <div className="flex items-center justify-between px-3 py-1.5">
        <span className="text-xs font-medium text-muted-foreground">Recent searches</span>
        <button
          type="button"
          onClick={onClear}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          data-testid="clear-recent"
        >
          Clear recent
        </button>
      </div>
      <ul role="list">
        {queries.map((query) => (
          <li key={query}>
            <button
              type="button"
              onClick={() => {
                onSelect(query);
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent transition-colors text-left"
              data-testid={`recent-query-${query}`}
            >
              <svg
                className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              <span className="truncate">{query}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
