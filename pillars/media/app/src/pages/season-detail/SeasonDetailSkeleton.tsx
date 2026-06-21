import { Skeleton } from '@pops/ui';

export function SeasonDetailSkeleton() {
  return (
    <div className="p-6 space-y-6">
      <Skeleton className="h-4 w-48" />
      <div className="flex gap-4">
        <Skeleton className="w-28 aspect-[2/3] rounded-lg shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </div>
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    </div>
  );
}
