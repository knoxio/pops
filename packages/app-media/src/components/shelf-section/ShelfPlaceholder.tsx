import { Skeleton } from '@pops/ui';

import type { RefObject } from 'react';

export function ShelfPlaceholder({
  sentinelRef,
}: {
  sentinelRef: RefObject<HTMLDivElement | null>;
}) {
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
