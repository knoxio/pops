import { useEffect, useMemo, useRef, useState } from 'react';

import { cn } from '../lib/utils';
import { Button } from '../primitives/button';
import { Skeleton } from '../primitives/skeleton';
import { ScrollShelf, type ScrollShelfProps } from './ScrollShelf';

export interface LazyScrollShelfProps<T> extends Omit<ScrollShelfProps<T>, 'items'> {
  /** Loader fired once the shelf becomes visible. */
  loadItems: () => Promise<T[]>;
  /** Skeleton placeholder count. Default 6. */
  placeholderCount?: number;
}

function useLazyLoad<T>(loadItems: () => Promise<T[]>, retryTick: number) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [items, setItems] = useState<T[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el || items !== null) return;
    let cancelled = false;
    let triggered = false;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting || triggered) continue;
          triggered = true;
          setLoading(true);
          setError(null);
          loadItems()
            .then((data) => {
              if (cancelled) return;
              setItems(data);
              io.disconnect();
            })
            .catch((e: unknown) => {
              if (cancelled) return;
              setError(e instanceof Error ? e.message : 'Failed to load');
              triggered = false;
            })
            .finally(() => {
              if (!cancelled) setLoading(false);
            });
          break;
        }
      },
      { rootMargin: '200px' }
    );
    io.observe(el);
    return () => {
      cancelled = true;
      io.disconnect();
    };
  }, [loadItems, items, retryTick]);

  return { wrapperRef, items, loading, error, setError };
}

interface PlaceholderShelfProps<T> {
  rest: Omit<ScrollShelfProps<T>, 'items'>;
  error: string | null;
  itemWidth: number;
  placeholderIds: string[];
  onRetry: () => void;
}

function PlaceholderShelf<T>({
  rest,
  error,
  itemWidth,
  placeholderIds,
  onRetry,
}: PlaceholderShelfProps<T>) {
  return (
    <section className={cn('flex flex-col gap-3', rest.className)}>
      {rest.title ? <h2 className="text-sm font-semibold">{rest.title}</h2> : null}
      {error ? (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
        >
          <span>{error}</span>
          <Button size="sm" variant="outline" onClick={onRetry}>
            Retry
          </Button>
        </div>
      ) : (
        <div className="flex gap-3 overflow-hidden">
          {placeholderIds.map((id) => (
            <Skeleton key={id} className="shrink-0 h-48" style={{ width: itemWidth }} />
          ))}
        </div>
      )}
    </section>
  );
}

export function LazyScrollShelf<T>({
  loadItems,
  placeholderCount = 6,
  ...rest
}: LazyScrollShelfProps<T>) {
  const [retryTick, setRetryTick] = useState(0);
  const { wrapperRef, items, loading, error, setError } = useLazyLoad(loadItems, retryTick);
  const itemWidth = rest.itemWidth ?? 192;
  const placeholderIds = useMemo(
    () => Array.from({ length: placeholderCount }, (_, i) => `ph-${placeholderCount}-${i}`),
    [placeholderCount]
  );

  return (
    <div ref={wrapperRef}>
      {items === null ? (
        <PlaceholderShelf
          rest={rest}
          error={error}
          itemWidth={itemWidth}
          placeholderIds={placeholderIds}
          onRetry={() => {
            setError(null);
            setRetryTick((t) => t + 1);
          }}
        />
      ) : (
        <ScrollShelf {...rest} items={items} />
      )}
      {loading && items === null ? <span className="sr-only">Loading</span> : null}
    </div>
  );
}
