/**
 * ShelfSection — lazy-loaded horizontal shelf for a single assembleSession shelf.
 *
 * Uses IntersectionObserver to defer rendering until the section scrolls into view.
 * Once visible, renders a HorizontalScrollRow with DiscoverCard items. Supports
 * "Show more" pagination via the getShelfPage tRPC endpoint.
 */
import { useRef, useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Skeleton, Button } from "@pops/ui";
import { Loader2 } from "lucide-react";
import { trpc } from "../lib/trpc";
import { HorizontalScrollRow } from "./HorizontalScrollRow";
import { DiscoverCard } from "./DiscoverCard";

interface ShelfItem {
  tmdbId: number;
  title: string;
  releaseDate: string;
  posterPath: string | null;
  posterUrl: string | null;
  voteAverage: number;
  inLibrary: boolean;
  isWatched?: boolean;
  onWatchlist?: boolean;
  matchPercentage?: number;
  matchReason?: string;
}

export interface ShelfSectionProps {
  shelfId: string;
  title: string;
  subtitle?: string;
  emoji?: string;
  initialItems: ShelfItem[];
  hasMore: boolean;
  /** Set of tmdbIds to hide (dismissed). */
  dismissedSet: Set<number>;
  addingToLibrary: Set<number>;
  addingToWatchlist: Set<number>;
  markingWatched: Set<number>;
  markingRewatched: Set<number>;
  dismissing: Set<number>;
  onAddToLibrary: (tmdbId: number) => void;
  onAddToWatchlist: (tmdbId: number) => void;
  onMarkWatched: (tmdbId: number) => void;
  onMarkRewatched: (tmdbId: number) => void;
  onNotInterested: (tmdbId: number) => void;
}

const LOAD_MORE_LIMIT = 20;

export function ShelfSection({
  shelfId,
  title,
  subtitle,
  initialItems,
  hasMore: initialHasMore,
  dismissedSet,
  addingToLibrary,
  addingToWatchlist,
  markingWatched,
  markingRewatched,
  dismissing,
  onAddToLibrary,
  onAddToWatchlist,
  onMarkWatched,
  onMarkRewatched,
  onNotInterested,
}: ShelfSectionProps) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [items, setItems] = useState<ShelfItem[]>(initialItems);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadingMore, setLoadingMore] = useState(false);
  const [offset, setOffset] = useState(initialItems.length);

  const utils = trpc.useUtils();

  // Observe sentinel div — becomes visible when scrolled into viewport
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setIsVisible(true);
        }
      },
      { rootMargin: "200px" }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  const handleShowMore = useCallback(async () => {
    setLoadingMore(true);
    try {
      const data = await utils.media.discovery.getShelfPage.fetch({
        shelfId,
        limit: LOAD_MORE_LIMIT,
        offset,
      });
      const existingIds = new Set(items.map((i) => i.tmdbId));
      const newItems = data.items.filter((i) => !existingIds.has(i.tmdbId));
      setItems((prev) => [...prev, ...newItems]);
      setOffset((prev) => prev + LOAD_MORE_LIMIT);
      setHasMore(data.hasMore);
    } catch {
      toast.error("Failed to load more");
    } finally {
      setLoadingMore(false);
    }
  }, [shelfId, offset, items, utils]);

  const visibleItems = items.filter((item) => !dismissedSet.has(item.tmdbId));

  // While off-screen: render a placeholder the same approximate height as the shelf
  if (!isVisible) {
    return (
      <div ref={sentinelRef} className="space-y-3">
        <div className="px-1">
          <div className="h-6 w-48 animate-pulse rounded bg-muted" />
        </div>
        <div className="flex gap-4 overflow-hidden pb-2">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="w-36 shrink-0 space-y-2 sm:w-40">
              <Skeleton className="aspect-[2/3] w-full rounded-md" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div ref={sentinelRef} className="space-y-3">
      <HorizontalScrollRow title={title} subtitle={subtitle}>
        {visibleItems.map((item) => (
          <DiscoverCard
            key={item.tmdbId}
            tmdbId={item.tmdbId}
            title={item.title}
            releaseDate={item.releaseDate}
            posterPath={item.posterPath}
            posterUrl={item.posterUrl}
            voteAverage={item.voteAverage}
            inLibrary={item.inLibrary}
            isWatched={item.isWatched}
            onWatchlist={item.onWatchlist}
            matchPercentage={item.matchPercentage}
            matchReason={item.matchReason}
            isAddingToLibrary={addingToLibrary.has(item.tmdbId)}
            isAddingToWatchlist={addingToWatchlist.has(item.tmdbId)}
            isMarkingWatched={markingWatched.has(item.tmdbId)}
            isMarkingRewatched={markingRewatched.has(item.tmdbId)}
            isDismissing={dismissing.has(item.tmdbId)}
            onAddToLibrary={onAddToLibrary}
            onAddToWatchlist={onAddToWatchlist}
            onMarkWatched={onMarkWatched}
            onMarkRewatched={onMarkRewatched}
            onNotInterested={onNotInterested}
          />
        ))}
        {hasMore && (
          <div className="flex shrink-0 items-center px-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleShowMore}
              disabled={loadingMore}
              className="whitespace-nowrap"
            >
              {loadingMore ? (
                <>
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  Loading…
                </>
              ) : (
                "Show more"
              )}
            </Button>
          </div>
        )}
      </HorizontalScrollRow>
    </div>
  );
}
