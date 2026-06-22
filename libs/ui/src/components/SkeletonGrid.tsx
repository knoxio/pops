import { cn } from '../lib/utils';
import { Skeleton } from '../primitives/skeleton';

export interface SkeletonGridProps {
  /** Number of skeleton cards to render */
  count: number;
  /** Height of each skeleton card (Tailwind class, e.g. "h-32") */
  itemHeight?: string;
  /** Grid column class (e.g. "sm:grid-cols-2 lg:grid-cols-4") */
  cols?: string;
  /** Gap class (e.g. "gap-4") */
  gap?: string;
  className?: string;
}

/**
 * Renders a responsive grid of skeleton placeholders for loading states.
 */
export function SkeletonGrid({
  count,
  itemHeight = 'h-32',
  cols = 'sm:grid-cols-2 lg:grid-cols-4',
  gap = 'gap-4',
  className,
}: SkeletonGridProps) {
  return (
    <div className={cn('grid', cols, gap, className)}>
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={`skeleton-${i}`} className={itemHeight} />
      ))}
    </div>
  );
}
