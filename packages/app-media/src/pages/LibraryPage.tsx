import { useState, useEffect } from "react";
import { useSearchParams, Link } from "react-router";
import { Button, Skeleton, TextInput } from "@pops/ui";
import { Sparkles, Settings, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { MediaGrid } from "../components/MediaGrid";
import { MediaCard } from "../components/MediaCard";
import { DownloadQueue } from "../components/DownloadQueue";
import { QuickPickDialog } from "../components/QuickPickDialog";
import { useMediaLibrary, type MediaType, type SortOption } from "../hooks/useMediaLibrary";

const TYPE_OPTIONS: { value: MediaType; label: string }[] = [
  { value: "all", label: "All" },
  { value: "movie", label: "Movies" },
  { value: "tv", label: "TV Shows" },
];

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "dateAdded", label: "Date Added" },
  { value: "title", label: "Title (A-Z)" },
  { value: "releaseDate", label: "Release Date" },
  { value: "rating", label: "Rating" },
];

const PAGE_SIZE_OPTIONS = [24, 48, 96] as const;

/** Debounce a string value by `delay` ms. */
function useDebouncedValue(value: string, delay: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function LibrarySkeleton() {
  return (
    <MediaGrid>
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="aspect-[2/3] w-full rounded-lg" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </MediaGrid>
  );
}

function PaginationControls({
  page,
  totalPages,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  totalPages: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}) {
  if (totalItems === 0) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>
          {totalItems} {totalItems === 1 ? "item" : "items"}
        </span>
        <span className="text-border">|</span>
        <span>
          Page {page} of {totalPages}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          aria-label="Items per page"
          className="h-8 rounded-md border bg-background px-2 text-sm"
        >
          {PAGE_SIZE_OPTIONS.map((size) => (
            <option key={size} value={size}>
              {size} per page
            </option>
          ))}
        </select>
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function isValidMediaType(v: string | null): v is MediaType {
  return v === "all" || v === "movie" || v === "tv";
}

function isValidSort(v: string | null): v is SortOption {
  return v === "title" || v === "dateAdded" || v === "releaseDate" || v === "rating";
}

export function LibraryPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Derive state from URL params
  const rawType = searchParams.get("type");
  const rawSort = searchParams.get("sort");
  const typeFilter: MediaType = isValidMediaType(rawType) ? rawType : "all";
  const sortBy: SortOption = isValidSort(rawSort) ? rawSort : "dateAdded";
  const genreFilter = searchParams.get("genre") || null;
  const searchQuery = searchParams.get("q") ?? "";
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const pageSize = PAGE_SIZE_OPTIONS.find((s) => s === Number(searchParams.get("pageSize"))) ?? 24;

  // Local search input state (synced to URL on debounce)
  const [localSearch, setLocalSearch] = useState(searchQuery);
  const debouncedSearch = useDebouncedValue(localSearch, 300);

  // Sync debounced search to URL
  useEffect(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (debouncedSearch) {
          next.set("q", debouncedSearch);
        } else {
          next.delete("q");
        }
        next.set("page", "1"); // Reset to page 1 on search change
        return next;
      },
      { replace: true }
    );
  }, [debouncedSearch, setSearchParams]);

  const setParam = (key: string, value: string) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) {
          next.set(key, value);
        } else {
          next.delete(key);
        }
        // Reset page on filter changes (except page/pageSize changes)
        if (key !== "page" && key !== "pageSize") {
          next.set("page", "1");
        }
        return next;
      },
      { replace: true }
    );
  };

  const { items, isLoading, isEmpty, allGenres, pagination } = useMediaLibrary({
    typeFilter,
    genreFilter,
    sortBy,
    search: debouncedSearch,
    page,
    pageSize,
  });

  const totalItems = pagination.total;
  const totalPages = pagination.totalPages;
  const clampedPage = Math.min(page, Math.max(1, totalPages));

  const showTypeBadge = typeFilter === "all";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Library</h1>
        <div className="flex items-center gap-3">
          <QuickPickDialog />
          <Link to="/media/quick-pick">
            <Button variant="outline" size="sm">
              <Sparkles className="h-4 w-4 mr-1.5" />
              Quick Pick
            </Button>
          </Link>
          <Link to="/media/plex">
            <Button variant="outline" size="sm">
              <Settings className="h-4 w-4 mr-1.5" />
              Plex
            </Button>
          </Link>
          <Link to="/media/arr">
            <Button variant="outline" size="sm">
              <Settings className="h-4 w-4 mr-1.5" />
              Arr
            </Button>
          </Link>
          <Link
            to="/media/search"
            className="text-sm font-medium text-app-accent hover:text-app-accent/80 transition-colors"
          >
            Search
          </Link>
        </div>
      </div>

      {/* Download queue */}
      <DownloadQueue />

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Type toggle */}
        <div
          className="flex rounded-lg border bg-muted/30 p-0.5"
          role="group"
          aria-label="Filter by type"
        >
          {TYPE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setParam("type", opt.value === "all" ? "" : opt.value)}
              aria-pressed={typeFilter === opt.value}
              className={`px-3 py-1 text-xs font-semibold uppercase tracking-wider rounded-md transition-all duration-200 ${
                typeFilter === opt.value
                  ? "bg-app-accent text-white shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Genre dropdown */}
        {allGenres.length > 0 && (
          <select
            value={genreFilter ?? ""}
            onChange={(e) => setParam("genre", e.target.value)}
            aria-label="Filter by genre"
            className="h-8 rounded-md border bg-background px-2 text-sm"
          >
            <option value="">All Genres</option>
            {allGenres.map((genre) => (
              <option key={genre} value={genre}>
                {genre}
              </option>
            ))}
          </select>
        )}

        {/* Sort dropdown */}
        <select
          value={sortBy}
          onChange={(e) => setParam("sort", e.target.value)}
          aria-label="Sort by"
          className="h-8 rounded-md border bg-background px-2 text-sm"
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        {/* Search input */}
        <TextInput
          placeholder="Search library..."
          value={localSearch}
          onChange={(e) => setLocalSearch(e.target.value)}
          prefix={<Search className="h-4 w-4" />}
          clearable
          onClear={() => setLocalSearch("")}
          className="w-full sm:max-w-xs"
          size="sm"
        />
      </div>

      {/* Content */}
      {isLoading ? (
        <LibrarySkeleton />
      ) : isEmpty ? (
        <div className="text-center py-16">
          <p className="text-muted-foreground">
            Your library is empty. Search for movies and shows to get started.
          </p>
          <Link to="/media/search" className="mt-4 inline-block text-sm text-primary underline">
            Search for media
          </Link>
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-muted-foreground">No results match your filters.</p>
        </div>
      ) : (
        <>
          <MediaGrid>
            {items.map((item) => (
              <MediaCard
                key={`${item.type}-${item.id}`}
                id={item.id}
                type={item.type}
                title={item.title}
                year={item.year}
                posterUrl={item.posterUrl}
                showTypeBadge={showTypeBadge}
              />
            ))}
          </MediaGrid>
          <PaginationControls
            page={clampedPage}
            totalPages={totalPages}
            pageSize={pageSize}
            totalItems={totalItems}
            onPageChange={(p) => setParam("page", String(p))}
            onPageSizeChange={(s) => {
              setSearchParams(
                (prev) => {
                  const next = new URLSearchParams(prev);
                  next.set("pageSize", String(s));
                  next.set("page", "1");
                  return next;
                },
                { replace: true }
              );
            }}
          />
        </>
      )}

      {/* Quick Pick FAB */}
      <Link
        to="/media/quick-pick"
        className="fixed bottom-6 right-6 z-50"
        aria-label="What should I watch tonight?"
      >
        <Button className="h-14 w-14 rounded-full bg-app-accent hover:bg-app-accent/90 shadow-lg shadow-app-accent/25 p-0">
          <Sparkles className="h-6 w-6" />
        </Button>
      </Link>
    </div>
  );
}
