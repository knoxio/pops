import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { usePillarUtils } from '@pops/pillar-sdk/react';

import type { ShelfItem } from './types';

const LOAD_MORE_LIMIT = 20;

interface ShelfPageResponse {
  items: ShelfItem[];
  hasMore: boolean;
  totalCount: number | null;
}

function useVisibilityObserver() {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) setIsVisible(true);
      },
      { rootMargin: '200px' }
    );
    observer.observe(sentinel);
    return () => {
      observer.disconnect();
    };
  }, []);
  return { sentinelRef, isVisible };
}

export function useShelfPagination({
  shelfId,
  initialItems,
  initialHasMore,
}: {
  shelfId: string;
  initialItems: ShelfItem[];
  initialHasMore: boolean;
}) {
  const { sentinelRef, isVisible } = useVisibilityObserver();
  const [items, setItems] = useState<ShelfItem[]>(initialItems);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadingMore, setLoadingMore] = useState(false);
  const [offset, setOffset] = useState(initialItems.length);

  const utils = usePillarUtils('media');

  const patchItem = useCallback((tmdbId: number, patch: Partial<ShelfItem>) => {
    setItems((prev) => prev.map((i) => (i.tmdbId === tmdbId ? { ...i, ...patch } : i)));
  }, []);

  const handleShowMore = useCallback(async () => {
    setLoadingMore(true);
    try {
      const data = await utils.fetchQuery<ShelfPageResponse>(['discovery', 'getShelfPage'], {
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
      toast.error('Failed to load more');
    } finally {
      setLoadingMore(false);
    }
  }, [shelfId, offset, items, utils]);

  return {
    sentinelRef,
    isVisible,
    items,
    hasMore,
    loadingMore,
    patchItem,
    handleShowMore,
  };
}
