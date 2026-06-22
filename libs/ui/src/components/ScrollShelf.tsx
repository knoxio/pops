/**
 * ScrollShelf — horizontal "shelf" of items with left/right scroll buttons.
 *
 * For an offscreen-lazy variant see `LazyScrollShelf` in `./ScrollShelf.lazy`.
 */
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';

import { cn } from '../lib/utils';
import { Button } from '../primitives/button';

export { LazyScrollShelf, type LazyScrollShelfProps } from './ScrollShelf.lazy';

export interface ScrollShelfProps<T> {
  title?: ReactNode;
  /** Optional trailing slot (e.g. "See all" link). */
  action?: ReactNode;
  items: T[];
  renderItem: (item: T, index: number) => ReactNode;
  getKey: (item: T, index: number) => string | number;
  /** Item width in pixels, used to compute scroll distance. Default 192. */
  itemWidth?: number;
  className?: string;
}

function useScrollButtons(itemsLength: number) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateButtons = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 8);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 8);
  }, []);

  useEffect(() => {
    updateButtons();
    const el = scrollRef.current;
    if (!el) return;
    const handler = () => updateButtons();
    el.addEventListener('scroll', handler, { passive: true });
    window.addEventListener('resize', handler);
    return () => {
      el.removeEventListener('scroll', handler);
      window.removeEventListener('resize', handler);
    };
  }, [updateButtons, itemsLength]);

  return { scrollRef, canScrollLeft, canScrollRight };
}

function ScrollButton({
  direction,
  onClick,
}: {
  direction: 'left' | 'right';
  onClick: () => void;
}) {
  return (
    <Button
      size="icon-sm"
      variant="secondary"
      aria-label={`Scroll ${direction}`}
      onClick={onClick}
      className={cn(
        'absolute top-1/2 -translate-y-1/2 shadow-md',
        direction === 'left' ? 'left-1' : 'right-1'
      )}
    >
      {direction === 'left' ? <ChevronLeft /> : <ChevronRight />}
    </Button>
  );
}

export function ScrollShelf<T>({
  title,
  action,
  items,
  renderItem,
  getKey,
  itemWidth = 192,
  className,
}: ScrollShelfProps<T>) {
  const { scrollRef, canScrollLeft, canScrollRight } = useScrollButtons(items.length);

  const scrollBy = (direction: 1 | -1) => {
    const el = scrollRef.current;
    if (!el) return;
    const distance = Math.max(itemWidth * 2, Math.round(el.clientWidth * 0.8));
    el.scrollBy({ left: direction * distance, behavior: 'smooth' });
  };

  return (
    <section className={cn('flex flex-col gap-3', className)}>
      {(title ?? action) && (
        <div className="flex items-center justify-between gap-3">
          {title ? <h2 className="text-sm font-semibold">{title}</h2> : <span />}
          {action}
        </div>
      )}
      <div className="relative">
        <div
          ref={scrollRef}
          className="flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {items.map((item, i) => (
            <div key={getKey(item, i)} className="snap-start shrink-0" style={{ width: itemWidth }}>
              {renderItem(item, i)}
            </div>
          ))}
        </div>
        {canScrollLeft ? <ScrollButton direction="left" onClick={() => scrollBy(-1)} /> : null}
        {canScrollRight ? <ScrollButton direction="right" onClick={() => scrollBy(1)} /> : null}
      </div>
    </section>
  );
}
