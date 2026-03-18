/**
 * InfiniteScrollTable - DataTable variant with infinite scroll instead of pagination
 * Built on TanStack Table with virtual scrolling
 */
import { useEffect, useRef, useCallback } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "./DataTable";

export interface InfiniteScrollTableProps<TData, TValue = unknown> {
  /**
   * Column definitions
   */
  columns: ColumnDef<TData, TValue>[];
  /**
   * Table data
   */
  data: TData[];
  /**
   * Callback to load more data
   */
  onLoadMore: () => void | Promise<void>;
  /**
   * Whether more data is available
   */
  hasMore: boolean;
  /**
   * Loading state
   */
  loading?: boolean;
  /**
   * Enable search functionality
   */
  searchable?: boolean;
  /**
   * Search placeholder text
   */
  searchPlaceholder?: string;
  /**
   * Column to search (if searchable)
   */
  searchColumn?: string;
  /**
   * Enable column visibility toggle
   */
  columnVisibility?: boolean;
  /**
   * Custom empty state
   */
  emptyState?: React.ReactNode;
  /**
   * Table className
   */
  className?: string;
  /**
   * Callback when row is clicked
   */
  onRowClick?: (row: TData) => void;
  /**
   * Scroll threshold (px from bottom to trigger load)
   */
  scrollThreshold?: number;
}

/**
 * InfiniteScrollTable component
 *
 * @example
 * ```tsx
 * const [transactions, setTransactions] = useState([]);
 * const [hasMore, setHasMore] = useState(true);
 * const [loading, setLoading] = useState(false);
 *
 * const loadMore = async () => {
 *   setLoading(true);
 *   const newData = await fetchTransactions(transactions.length);
 *   setTransactions([...transactions, ...newData]);
 *   setHasMore(newData.length > 0);
 *   setLoading(false);
 * };
 *
 * <InfiniteScrollTable
 *   columns={columns}
 *   data={transactions}
 *   onLoadMore={loadMore}
 *   hasMore={hasMore}
 *   loading={loading}
 *   searchable
 * />
 * ```
 */
export function InfiniteScrollTable<TData, TValue>({
  columns,
  data,
  onLoadMore,
  hasMore,
  loading = false,
  searchable = false,
  searchPlaceholder,
  searchColumn,
  columnVisibility = true,
  emptyState,
  className,
  onRowClick,
  scrollThreshold = 200,
}: InfiniteScrollTableProps<TData, TValue>) {
  const observerTarget = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);

  const handleLoadMore = useCallback(async () => {
    if (loadingRef.current || !hasMore) return;
    loadingRef.current = true;
    try {
      await onLoadMore();
    } finally {
      loadingRef.current = false;
    }
  }, [onLoadMore, hasMore]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading) {
          handleLoadMore();
        }
      },
      { threshold: 0.1, rootMargin: `${scrollThreshold}px` }
    );

    const currentTarget = observerTarget.current;
    if (currentTarget) {
      observer.observe(currentTarget);
    }

    return () => {
      if (currentTarget) {
        observer.unobserve(currentTarget);
      }
    };
  }, [hasMore, loading, handleLoadMore, scrollThreshold]);

  return (
    <div className={className}>
      <DataTable
        columns={columns}
        data={data}
        searchable={searchable}
        searchPlaceholder={searchPlaceholder}
        searchColumn={searchColumn}
        columnVisibility={columnVisibility}
        emptyState={emptyState}
        loading={loading && data.length === 0}
        onRowClick={onRowClick}
        paginated={false}
      />
      {/* Infinite scroll trigger */}
      {data.length > 0 && (
        <div ref={observerTarget} className="py-4 text-center">
          {loading && (
            <div className="text-sm text-muted-foreground">Loading more...</div>
          )}
          {!loading && !hasMore && (
            <div className="text-sm text-muted-foreground">
              No more items to load
            </div>
          )}
        </div>
      )}
    </div>
  );
}
